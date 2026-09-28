-- Firebase IDs are retained, so existing accounts keep ownership after migration.
create table public.korae_documents (
  kind text not null check (kind in ('profiles','pins','posts','comments','following','reposts','balances','battleSessions')),
  id text not null,
  parent text not null default '',
  owner text not null default '',
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  primary key (kind, parent, id)
);
create index korae_owner on public.korae_documents(kind, owner);
create index korae_created on public.korae_documents(kind, ((body->>'createdAt')::bigint) desc);
alter table public.korae_documents enable row level security;
revoke all on public.korae_documents from anon, authenticated;
grant all on public.korae_documents to service_role;

-- Only the Edge Function service role may call this transaction boundary.
-- p_uid and validated p_value are supplied by the server, never by browser identity fields.
create or replace function public.korae_mutate(p_action text, p_uid text, p_id text default '', p_value jsonb default '{}')
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  old jsonb; value jsonb; target text; slot integer; now_ms bigint;
  today integer; current_bp bigint; lifetime_bp bigint;
begin
  if p_uid is null or p_uid = '' then raise exception '로그인이 필요합니다.'; end if;
  -- Serialize a user's check-in, pin allocation and battle starts/finishes.
  perform pg_advisory_xact_lock(hashtextextended(p_uid, 0));
  now_ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  if p_action = 'checkin' then
    today := floor((now_ms + 32400000)::numeric / 86400000)::integer;
    select body into old from korae_documents where kind='balances' and id=p_uid and parent='';
    if coalesce((old->>'day')::integer, -1) >= today then return old; end if;
    current_bp := coalesce((old->>'current')::bigint,0)+10;
    lifetime_bp := coalesce((old->>'lifetime')::bigint,0)+10;
    value := jsonb_build_object('current',current_bp,'lifetime',lifetime_bp,'day',today,'updatedAt',now_ms);
    insert into korae_documents values ('balances',p_uid,'',p_uid,value)
      on conflict (kind,parent,id) do update set body=excluded.body;
    return value;
  elsif p_action = 'savePin' then
    if p_id <> '' then
      select body into old from korae_documents where kind='pins' and id=p_id and owner=p_uid;
      if old is null then raise exception '수정할 수 없는 거래입니다.'; end if;
      slot := (old->>'slot')::integer; target := p_id;
    else
      select n into slot from generate_series(0,2) n where not exists
        (select 1 from korae_documents where kind='pins' and id=p_uid||'_'||n::text) order by n limit 1;
      if slot is null then raise exception '거래는 계정당 최대 3개까지 등록할 수 있습니다.'; end if;
      target := p_uid||'_'||slot::text;
    end if;
    value := p_value || jsonb_build_object('ownerId',p_uid,'slot',slot::text);
    insert into korae_documents values ('pins',target,'',p_uid,value)
      on conflict(kind,parent,id) do update set body=excluded.body;
    return value || jsonb_build_object('id',target,'owner',true);
  elsif p_action = 'startBattle' then
    if not exists (select 1 from korae_documents where kind='posts' and id=p_value->>'postId') then
      raise exception '삭제된 피드입니다.';
    end if;
    select body into old from korae_documents where kind='battleSessions' and id=p_uid;
    if old->>'id' = p_id then
      if old->>'postId' <> p_value->>'postId' or old->>'side' <> p_value->>'side' or old->>'status' <> 'playing' then
        raise exception '이미 종료한 배틀입니다.';
      end if;
      return old;
    end if;
    value := p_value || jsonb_build_object('id',p_id,'status','playing','startedAt',now_ms);
    insert into korae_documents values ('battleSessions',p_uid,'',p_uid,value)
      on conflict(kind,parent,id) do update set body=excluded.body;
    return value;
  elsif p_action = 'finishBattle' then
    select body into old from korae_documents where kind='battleSessions' and id=p_uid for update;
    if old is null or old->>'id' <> p_id then raise exception '다른 배틀이 시작되었습니다. 다시 참여해 주세요.'; end if;
    if p_value->>'sessionSeed' is distinct from old->>'seed' or p_value->>'sessionStartedAt' is distinct from old->>'startedAt' or p_value->>'postId' is distinct from old->>'postId' then
      raise exception '다른 배틀이 시작되었습니다. 다시 참여해 주세요.';
    end if;
    if old->>'status' = 'finished' then return old->'result'; end if;
    if now_ms - (old->>'startedAt')::bigint > 1800000 then raise exception '배틀 유효 시간이 지났습니다.'; end if;
    if p_value->>'side' is distinct from old->>'side' or (p_value->>'score')::integer < 0 then raise exception '잘못된 배틀 점수입니다.'; end if;
    -- This row update serializes concurrent players on the same post.
    update korae_documents set body=jsonb_set(body,array[old->>'side'],
      to_jsonb(coalesce((body->>(old->>'side'))::bigint,0)+(p_value->>'score')::bigint))
      where kind='posts' and id=old->>'postId';
    if not found then raise exception '삭제된 피드에는 점수를 반영할 수 없습니다.'; end if;
    value := p_value - 'sessionSeed' - 'sessionStartedAt' - 'postId';
    update korae_documents set body=body || jsonb_build_object('status','finished','result',value,'finishedAt',now_ms)
      where kind='battleSessions' and id=p_uid;
    return value;
  elsif p_action = 'deletePost' then
    delete from korae_documents where kind='posts' and id=p_id and owner=p_uid;
    if not found then raise exception '삭제할 수 없는 피드입니다.'; end if;
    delete from korae_documents where kind in ('comments','reposts') and parent=p_id;
    return 'null'::jsonb;
  elsif p_action in ('comment','repost') then
    perform 1 from korae_documents where kind='posts' and id=p_value->>'postId' for update;
    if not found then raise exception '삭제된 피드입니다.'; end if;
    if p_action='comment' then
      value := (p_value-'postId') || jsonb_build_object('authorId',p_uid,'createdAt',now_ms);
      insert into korae_documents values ('comments',p_id,p_value->>'postId',p_uid,value);
    elsif (p_value->>'enabled')::boolean then
      insert into korae_documents values ('reposts',p_uid,p_value->>'postId',p_uid,jsonb_build_object('createdAt',now_ms))
        on conflict do nothing;
    else
      delete from korae_documents where kind='reposts' and parent=p_value->>'postId' and id=p_uid;
    end if;
    return 'null'::jsonb;
  end if;
  raise exception '지원하지 않는 작업입니다.';
end;
$$;
revoke all on function public.korae_mutate(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.korae_mutate(text,text,text,jsonb) to service_role;
