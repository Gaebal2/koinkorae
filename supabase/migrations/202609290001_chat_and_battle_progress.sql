-- Private messages share the existing service-role-only document store.
alter table public.korae_documents drop constraint if exists korae_documents_kind_check;
alter table public.korae_documents add constraint korae_documents_kind_check
  check (kind in ('profiles','pins','posts','comments','following','reposts','balances','battleSessions','messages'));
create index if not exists korae_conversation_created on public.korae_documents(parent, ((body->>'createdAt')::bigint)) where kind='messages';

-- Preserve the existing transaction implementation and extend it without rewriting history.
do $$ begin
  if to_regprocedure('public.korae_mutate_base(text,text,text,jsonb)') is null then
    alter function public.korae_mutate(text,text,text,jsonb) rename to korae_mutate_base;
  end if;
end $$;
create or replace function public.korae_mutate(p_action text,p_uid text,p_id text default '',p_value jsonb default '{}')
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare old jsonb; value jsonb; now_ms bigint; score bigint; current_revision bigint; conversation text;
begin
  if p_uid is null or p_uid='' then raise exception '로그인이 필요합니다.'; end if;
  if p_action='sendMessage' then
    -- Both participants must still be friends at the transaction boundary.
    conversation := p_value->>'parent';
    perform pg_advisory_xact_lock(hashtextextended(conversation,1));
    if p_uid=p_value->>'friendId'
      or not exists(select 1 from korae_documents where kind='following' and parent=p_uid and id=p_value->>'friendId')
      or not exists(select 1 from korae_documents where kind='following' and parent=p_value->>'friendId' and id=p_uid)
      then raise exception '서로 팔로우한 친구와만 채팅할 수 있습니다.'; end if;
    select body into old from korae_documents where kind='messages' and parent=conversation and id=p_id;
    if old is not null then
      if old->>'senderId'<>p_uid or old->>'content'<>p_value->>'content' then raise exception '이미 사용한 메시지 ID입니다.'; end if;
      return old || jsonb_build_object('id',p_id);
    end if;
    select greatest(floor(extract(epoch from clock_timestamp())*1000)::bigint,coalesce(max((body->>'createdAt')::bigint),0)+1)
      into now_ms from korae_documents where kind='messages' and parent=conversation;
    value:=jsonb_build_object('senderId',p_uid,'recipientId',p_value->>'friendId','content',p_value->>'content','createdAt',now_ms);
    insert into korae_documents values('messages',p_id,conversation,p_uid,value);
    return value || jsonb_build_object('id',p_id);
  elsif p_action in ('battleProgress','applyBattle') then
    perform pg_advisory_xact_lock(hashtextextended(p_uid,0));
    select body into old from korae_documents where kind='battleSessions' and id=p_uid and parent='' for update;
    if old is null or old->>'id'<>p_id or old->>'protocol'<>'2' then raise exception '진행 중인 배틀이 아닙니다.'; end if;
    if p_action='battleProgress' then
      if old->>'status'<>'playing' then raise exception '이미 점수를 적용한 배틀입니다.'; end if;
      current_revision:=(old->'progress'->>'revision')::bigint;
      if current_revision=(p_value->>'expectedRevision')::bigint+1 and old->'progress'->>'lastOp'=p_value->>'op' then return old->'progress'; end if;
      if current_revision<>(p_value->>'expectedRevision')::bigint or (p_value->'next'->>'revision')::bigint<>current_revision+1 then raise exception '게임 기록 순서가 일치하지 않습니다.'; end if;
      update korae_documents set body=jsonb_set(body,'{progress}',p_value->'next') where kind='battleSessions' and id=p_uid and parent='';
      return p_value->'next';
    end if;
    if old->>'status'='finished' then return old->'result'; end if;
    if coalesce((old->'progress'->'game'->>'ended')::boolean,false)=false then raise exception '게임 종료 후 점수를 적용해 주세요.'; end if;
    score:=(old->'progress'->>'bankedScore')::bigint+(old->'progress'->'game'->>'score')::bigint;
    if score<0 then raise exception '잘못된 배틀 점수입니다.'; end if;
    update korae_documents set body=jsonb_set(body,array[old->>'side'],to_jsonb(coalesce((body->>(old->>'side'))::bigint,0)+score)) where kind='posts' and id=old->>'postId';
    if not found then raise exception '삭제된 피드에는 점수를 반영할 수 없습니다.'; end if;
    value:=jsonb_build_object('score',score,'side',old->>'side','delta',case when old->>'side'='oppose' then -score else score end);
    update korae_documents set body=body||jsonb_build_object('status','finished','result',value,'finishedAt',floor(extract(epoch from clock_timestamp())*1000)::bigint) where kind='battleSessions' and id=p_uid and parent='';
    return value;
  end if;
  return public.korae_mutate_base(p_action,p_uid,p_id,p_value);
end $$;
revoke all on function public.korae_mutate(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.korae_mutate(text,text,text,jsonb) to service_role;
