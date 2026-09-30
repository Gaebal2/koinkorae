-- Reposts are independent feed entries, linked to a canonical original.
-- Keep the relation table for per-user uniqueness and share counts.
do $$ begin
  if to_regprocedure('public.korae_mutate_before_repost_feeds(text,text,text,jsonb)') is null then
    alter function public.korae_mutate(text,text,text,jsonb) rename to korae_mutate_before_repost_feeds;
  end if;
end $$;
create or replace function public.korae_mutate(p_action text,p_uid text,p_id text default '',p_value jsonb default '{}')
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare original text; target text; post jsonb; session jsonb; result jsonb; now_ms bigint := floor(extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if p_uid is null or p_uid='' then raise exception '로그인이 필요합니다.'; end if;
  if p_action='repost' then
    if jsonb_typeof(p_value->'enabled') is distinct from 'boolean' or
       jsonb_typeof(coalesce(p_value->'comment','""'::jsonb)) is distinct from 'string' or
       length(coalesce(p_value->>'comment',''))>100 then raise exception '리포스트 코멘트는 100자 이내로 입력해 주세요.'; end if;
    select coalesce(body->>'originalPostId',id) into original from korae_documents where kind='posts' and parent='' and id=p_value->>'postId';
    select body into post from korae_documents where kind='posts' and parent='' and id=original for update;
    if not found then raise exception '삭제된 피드입니다.'; end if;
    target:='repost_'||md5(original||':'||p_uid);
    if (p_value->>'enabled')::boolean then
      insert into korae_documents values('posts',target,'',p_uid,
        (post-'likeCount')||jsonb_build_object('originalPostId',original,'originalCreatedAt',post->'createdAt','repostAuthorId',p_uid,'repostComment',coalesce(p_value->>'comment',''),'createdAt',now_ms,'support',0,'oppose',0,'likeCount',0)) on conflict do nothing;
      insert into korae_documents values('reposts',p_uid,original,p_uid,jsonb_build_object('createdAt',now_ms,'feedId',target)) on conflict do nothing;
    else
      delete from korae_documents where kind='posts' and parent='' and id=target and owner=p_uid;
      delete from korae_documents where kind in ('comments','likes') and parent=target;
      delete from korae_documents where kind='reposts' and parent=original and id=p_uid;
    end if;
    return jsonb_build_object('id',target);
  elsif p_action in ('applyBattle','finishBattle') then
    perform pg_advisory_xact_lock(hashtextextended(p_uid,0));
    select body into session from korae_documents where kind='battleSessions' and parent='' and id=p_uid for update;
    if session is null or session->>'id'<>p_id then raise exception '진행 중인 배틀이 아닙니다.'; end if;
    if session->>'status'='finished' then return session->'result'; end if;
    select body->>'originalPostId' into original from korae_documents where kind='posts' and parent='' and id=session->>'postId';
    if original is not null then
      perform 1 from korae_documents where kind='posts' and parent='' and id=original for update;
      if not found then raise exception '삭제된 원본 피드입니다.'; end if;
    end if;
    result:=public.korae_mutate_before_repost_feeds(p_action,p_uid,p_id,p_value);
    if original is not null then
      update korae_documents set body=jsonb_set(body,array[session->>'side'],to_jsonb(coalesce((body->>(session->>'side'))::bigint,0)+(result->>'score')::bigint)) where kind='posts' and parent='' and id=original;
    end if;
    return result;
  elsif p_action='deletePost' then
    select body into post from korae_documents where kind='posts' and parent='' and id=p_id and owner=p_uid;
    if post is null then raise exception '삭제할 수 없는 피드입니다.'; end if;
    -- Delete an original and all dependent entries in the same transaction.
    result:=public.korae_mutate_before_repost_feeds(p_action,p_uid,p_id,p_value);
    if post->>'originalPostId' is not null then
      delete from korae_documents where kind='reposts' and parent=post->>'originalPostId' and id=p_uid;
    else
      delete from korae_documents where kind in ('comments','likes') and parent in (select id from korae_documents where kind='posts' and body->>'originalPostId'=p_id);
      delete from korae_documents where kind='posts' and body->>'originalPostId'=p_id;
    end if;
    return result;
  end if;
  return public.korae_mutate_before_repost_feeds(p_action,p_uid,p_id,p_value);
end $$;
revoke all on function public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_repost_feeds(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_repost_feeds(text,text,text,jsonb) to service_role;

-- Preserve existing share dates when migrating historic reposts.
insert into korae_documents(kind,id,parent,owner,body)
select 'posts','repost_'||md5(r.parent||':'||r.id),'',r.id,
  (p.body-'likeCount')||jsonb_build_object('originalPostId',p.id,'originalCreatedAt',p.body->'createdAt','repostAuthorId',r.id,'repostComment','','createdAt',r.body->'createdAt','support',0,'oppose',0,'likeCount',0)
from korae_documents r join korae_documents p on p.kind='posts' and p.parent='' and p.id=r.parent
where r.kind='reposts' on conflict do nothing;
update korae_documents set body=body||jsonb_build_object('feedId','repost_'||md5(parent||':'||id)) where kind='reposts';
create index if not exists korae_original_post on korae_documents((body->>'originalPostId')) where kind='posts';

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
    and (p_options->>'author' is null or (d.owner=p_options->>'author' and d.body->>'originalPostId' is null))
    and (p_options->>'coin' is null or d.body->>'coin'=p_options->>'coin')
    and (p_options->>'repostedBy' is null or (d.owner=p_options->>'repostedBy' and d.body->>'repostAuthorId'=p_options->>'repostedBy'))
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
  shares as (select parent,count(*) as total,bool_or(id=p_uid) as mine from korae_documents where kind='reposts' and parent in(select coalesce(body->>'originalPostId',id) from page) group by parent),
  enriched as (
    select p.id,p.stamp,p.score,p.body||jsonb_build_object('id',p.id,'score',p.score)||
      case when mode='coins' then '{}'::jsonb else jsonb_build_object('author',coalesce(a.body->>'username',p.body->>'author'),'authorProfile',a.body||jsonb_build_object('id',a.id),'repostProfile',rp.body||jsonb_build_object('id',rp.id),'commentCount',coalesce(c.total,0),'repostCount',coalesce(r.total,0),'reposted',coalesce(r.mine,false),'likeCount',coalesce((p.body->>'likeCount')::bigint,0),'liked',exists(select 1 from korae_documents l where l.kind='likes' and l.parent=p.id and l.id=p_uid)) end as value
    from page p left join korae_documents a on mode='posts' and a.kind='profiles' and a.parent='' and a.id=p.body->>'authorId'
      left join korae_documents rp on rp.kind='profiles' and rp.parent='' and rp.id=p.body->>'repostAuthorId'
      left join counts c on c.parent=p.id left join shares r on r.parent=coalesce(p.body->>'originalPostId',p.id)
  ) select jsonb_build_object('items',coalesce(jsonb_agg(value order by score desc,stamp desc,id),'[]'),
    'nextCursor',case when (select count(*) from candidates)>n then (select jsonb_build_array(score,stamp,id) from page order by score,stamp,id desc limit 1) else null end)
  into result from enriched;
  return result;
end $$;


revoke all on function public.korae_page(text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.korae_page(text,jsonb,jsonb,integer) to service_role;
