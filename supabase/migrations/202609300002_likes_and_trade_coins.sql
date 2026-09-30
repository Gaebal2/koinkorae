-- A like belongs to one verified user and one post. Browser roles have no access.
alter table public.korae_documents drop constraint if exists korae_documents_kind_check;
alter table public.korae_documents add constraint korae_documents_kind_check
  check (kind in ('profiles','pins','posts','comments','following','reposts','balances','battleSessions','messages','likes'));

do $$ begin
  if to_regprocedure('public.korae_mutate_before_likes(text,text,text,jsonb)') is null then
    alter function public.korae_mutate(text,text,text,jsonb) rename to korae_mutate_before_likes;
  end if;
end $$;
create or replace function public.korae_mutate(p_action text,p_uid text,p_id text default '',p_value jsonb default '{}')
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare post jsonb; changes integer; total bigint; result jsonb;
begin
  if p_uid is null or p_uid='' then raise exception '로그인이 필요합니다.'; end if;
  if p_action='like' then
    if jsonb_typeof(p_value->'enabled') is distinct from 'boolean' then raise exception '잘못된 요청입니다.'; end if;
    -- Serialize reactions against deletion and other updates to this post.
    select body into post from korae_documents where kind='posts' and parent='' and id=p_id for update;
    if not found then raise exception '삭제된 피드입니다.'; end if;
    total:=coalesce((post->>'likeCount')::bigint,0);
    if (p_value->>'enabled')::boolean then
      insert into korae_documents values('likes',p_uid,p_id,p_uid,jsonb_build_object('createdAt',floor(extract(epoch from clock_timestamp())*1000)::bigint))
        on conflict(kind,parent,id) do nothing;
      get diagnostics changes = row_count;
      total:=total+changes;
    else
      delete from korae_documents where kind='likes' and parent=p_id and id=p_uid;
      get diagnostics changes = row_count;
      total:=greatest(0,total-changes);
    end if;
    if changes>0 then
      -- The existing public post notification invalidates feed caches, without
      -- broadcasting the identity of the person who liked the post.
      update korae_documents set body=jsonb_set(body,'{likeCount}',to_jsonb(total)) where kind='posts' and parent='' and id=p_id;
    end if;
    return jsonb_build_object('liked',(p_value->>'enabled')::boolean,'likeCount',total);
  elsif p_action='savePin' then
    if jsonb_typeof(p_value->'tradeCoins') is distinct from 'array' then raise exception '거래 코인을 확인해 주세요.'; end if;
    if jsonb_array_length(p_value->'tradeCoins')>20 or
      (select count(distinct value) from jsonb_array_elements(p_value->'tradeCoins'))<>jsonb_array_length(p_value->'tradeCoins') then
      raise exception '거래 가능한 코인은 중복 없이 최대 20개까지 선택할 수 있습니다.';
    end if;
  end if;
  result:=public.korae_mutate_before_likes(p_action,p_uid,p_id,p_value);
  if p_action='deletePost' then delete from korae_documents where kind='likes' and parent=p_id; end if;
  return result;
end $$;
revoke all on function public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_likes(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_likes(text,text,text,jsonb) to service_role;

create index if not exists korae_post_likes on public.korae_documents
  ((coalesce((body->>'likeCount')::bigint,0)) desc, ((body->>'createdAt')::bigint) desc, id) where kind='posts';

-- Keep ranking, pagination and viewer state in the same feed query.
create or replace function public.korae_page(p_uid text, p_options jsonb default '{}', p_cursor jsonb default null, p_limit integer default 20)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare result jsonb; mode text := coalesce(p_options->>'mode','posts'); n integer := least(greatest(p_limit,1),100);
begin
  if mode in ('comments','ownComments') then
    if mode='ownComments' and p_uid is null then raise exception 'Authentication required'; end if;
    with candidates as (
      select d.id,d.parent,d.body,coalesce((d.body->>'createdAt')::bigint,0) as stamp
      from korae_documents d join korae_documents post on post.kind='posts' and post.parent='' and post.id=d.parent
      where d.kind='comments' and (case when mode='ownComments' then d.owner=p_uid else d.parent=p_options->>'postId' end)
      and (p_cursor is null or (d.body->>'createdAt')::bigint < (p_cursor->>0)::bigint
        or ((d.body->>'createdAt')::bigint=(p_cursor->>0)::bigint and d.id>p_cursor->>2))
      order by stamp desc,d.id limit n+1
    ), page as (select * from candidates order by stamp desc,id limit n), enriched as (
      select c.id,c.stamp,c.body||jsonb_build_object('id',c.id,'author',coalesce(a.body->>'username',c.body->>'author'),'authorProfile',a.body||jsonb_build_object('id',a.id),'replyExists',reply.id is not null)
        ||case when mode='ownComments' then jsonb_build_object('post',p.body||jsonb_build_object('id',p.id,'author',coalesce(pa.body->>'username',p.body->>'author'))) else '{}'::jsonb end as value
      from page c left join korae_documents a on a.kind='profiles' and a.parent='' and a.id=c.body->>'authorId'
      left join korae_documents reply on reply.kind='comments' and reply.parent=c.parent and reply.id=c.body->'replyTo'->>'id'
      left join korae_documents p on p.kind='posts' and p.parent='' and p.id=c.parent
      left join korae_documents pa on pa.kind='profiles' and pa.parent='' and pa.id=p.body->>'authorId'
    ) select jsonb_build_object('items',coalesce(jsonb_agg(value order by stamp desc,id),'[]'),
      'nextCursor',case when (select count(*) from candidates)>n then (select jsonb_build_array(stamp,stamp,id) from page order by stamp,id desc limit 1) else null end) into result from enriched;
    return result;
  end if;
  if mode='pins' then
    with candidates as (
      select d.id,d.body from korae_documents d where d.kind='pins'
      and (p_options->>'owner' is null or d.owner=p_options->>'owner')
      and (p_cursor is null or d.id > p_cursor->>0)
      and (p_options->'bounds' is null or (
        (d.body->>'lat')::numeric between (p_options->'bounds'->>0)::numeric and (p_options->'bounds'->>2)::numeric
        and (case when (p_options->'bounds'->>1)::numeric <= (p_options->'bounds'->>3)::numeric
          then (d.body->>'lng')::numeric between (p_options->'bounds'->>1)::numeric and (p_options->'bounds'->>3)::numeric
          else (d.body->>'lng')::numeric >= (p_options->'bounds'->>1)::numeric or (d.body->>'lng')::numeric <= (p_options->'bounds'->>3)::numeric end)))
      order by d.id limit n+1
    ), page as (select * from candidates order by id limit n)
    select jsonb_build_object('items',coalesce(jsonb_agg(
      (case when p_options->>'detail'='true' then body else jsonb_build_object('lat',body->'lat','lng',body->'lng','coin',body->'coin','title',body->'title','ownerId',body->'ownerId') end)
      ||jsonb_build_object('id',id,'owner',coalesce(body->>'ownerId'=p_uid,false)) order by id),'[]'),
      'nextCursor',case when (select count(*) from candidates)>n then (select jsonb_build_array(id) from page order by id desc limit 1) else null end) into result from page;
    return result;
  end if;
  if mode not in ('posts','coins') then raise exception 'Invalid page mode'; end if;
  with eligible as (
    select d.id,d.body,coalesce((d.body->>'createdAt')::bigint,0) as stamp,
      case p_options->>'category' when '최신' then coalesce((d.body->>'createdAt')::bigint,0)
        when '좋아요' then coalesce((d.body->>'likeCount')::bigint,0)
        when '논쟁' then least(coalesce((d.body->>'support')::bigint,0),coalesce((d.body->>'oppose')::bigint,0))
        when '급상승' then coalesce((d.body->>'support')::bigint,0)+coalesce((d.body->>'oppose')::bigint,0)
        else coalesce((d.body->>'support')::bigint,0)-coalesce((d.body->>'oppose')::bigint,0) end as score
    from korae_documents d where d.kind='posts'
    and coalesce((d.body->>'createdAt')::bigint,0) <= coalesce((p_options->>'until')::bigint,(extract(epoch from now())*1000)::bigint)
    and (p_options->>'since' is null or (d.body->>'createdAt')::bigint >= (p_options->>'since')::bigint)
    and (p_options->>'author' is null or d.owner=p_options->>'author')
    and (p_options->>'coin' is null or d.body->>'coin'=p_options->>'coin')
    and (p_options->>'repostedBy' is null or exists(select 1 from korae_documents r where r.kind='reposts' and r.parent=d.id and r.id=p_options->>'repostedBy'))
    and (p_options->>'category' is distinct from '팔로잉' or exists(select 1 from korae_documents f where f.kind='following' and f.parent=p_uid and f.id=d.owner))
  ), ranked as (
    select id,body,stamp,score from eligible where mode='posts'
    union all
    select body->>'coin',jsonb_build_object('coin',body->>'coin','count',count(*)),0,
      case when p_options->>'category'='최신' then max(score) else sum(score)::bigint end
    from eligible where mode='coins' group by body->>'coin'
  ), candidates as (
    select * from ranked where p_cursor is null or score < (p_cursor->>0)::bigint
      or (score=(p_cursor->>0)::bigint and stamp<(p_cursor->>1)::bigint)
      or (score=(p_cursor->>0)::bigint and stamp=(p_cursor->>1)::bigint and id>p_cursor->>2)
    order by score desc,stamp desc,id limit n+1
  ), page as (select * from candidates order by score desc,stamp desc,id limit n),
  counts as (select parent,count(*) as total from korae_documents where kind='comments' and parent in(select id from page) group by parent),
  shares as (select parent,count(*) as total,bool_or(id=p_uid) as mine from korae_documents where kind='reposts' and parent in(select id from page) group by parent),
  enriched as (
    select p.id,p.stamp,p.score,p.body||jsonb_build_object('id',p.id,'score',p.score)||
      case when mode='coins' then '{}'::jsonb else jsonb_build_object('author',coalesce(a.body->>'username',p.body->>'author'),'authorProfile',a.body||jsonb_build_object('id',a.id),'commentCount',coalesce(c.total,0),'repostCount',coalesce(r.total,0),'reposted',coalesce(r.mine,false),'likeCount',coalesce((p.body->>'likeCount')::bigint,0),'liked',exists(select 1 from korae_documents l where l.kind='likes' and l.parent=p.id and l.id=p_uid)) end as value
    from page p left join korae_documents a on mode='posts' and a.kind='profiles' and a.parent='' and a.id=p.body->>'authorId'
      left join counts c on c.parent=p.id left join shares r on r.parent=p.id
  ) select jsonb_build_object('items',coalesce(jsonb_agg(value order by score desc,stamp desc,id),'[]'),
    'nextCursor',case when (select count(*) from candidates)>n then (select jsonb_build_array(score,stamp,id) from page order by score,stamp,id desc limit 1) else null end)
  into result from enriched;
  return result;
end $$;


revoke all on function public.korae_page(text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.korae_page(text,jsonb,jsonb,integer) to service_role;
