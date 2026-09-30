-- Keep battle history for calendar-month/year/all-time activity queries.
-- No historic lifetime totals are synthesized into activity timestamps.
create or replace function public.korae_track_feed_battle_activity()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare change bigint; bucket bigint := floor(extract(epoch from clock_timestamp())/60)::bigint;
begin
  if tg_op='DELETE' then
    delete from korae_feed_battle_activity where post_id=old.id;
    return old;
  end if;
  change:=abs(coalesce((new.body->>'support')::bigint,0)-coalesce((old.body->>'support')::bigint,0))
    +abs(coalesce((new.body->>'oppose')::bigint,0)-coalesce((old.body->>'oppose')::bigint,0));
  if change>0 then
    insert into korae_feed_battle_activity(post_id,minute,magnitude) values(new.id,bucket,change)
      on conflict(post_id,minute) do update set magnitude=korae_feed_battle_activity.magnitude+excluded.magnitude;
  end if;
  return new;
end $$;

-- Sum activity density: one point/new active engagement contributes
-- 1 / (1 + elapsed minutes). Scale by 1,000,000 for integer cursor scores.
-- The selected calendar start limits events, not the post's publication date.
create or replace function public.korae_feed_activity_score(p_post text,p_at bigint,p_since bigint)
returns bigint language sql stable set search_path=public,pg_temp as $$
  select floor(coalesce(sum(units::numeric*1000000/(1+p_at/60000-minute)),0))::bigint from (
    select minute,magnitude as units from korae_feed_battle_activity
      where post_id=p_post and minute>=p_since/60000 and minute<=p_at/60000
    union all
    select (body->>'createdAt')::bigint/60000,1::bigint from korae_documents
      where parent=p_post and kind in ('comments','likes','reposts')
        and (body->>'createdAt')::bigint>=p_since and (body->>'createdAt')::bigint<=p_at
  ) recent;
$$;
-- Older internal callers without a period now mean all available activity.
create or replace function public.korae_feed_activity_score(p_post text,p_at bigint)
returns bigint language sql stable set search_path=public,pg_temp as $$
  select public.korae_feed_activity_score(p_post,p_at,0);
$$;
revoke all on function public.korae_feed_activity_score(text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.korae_feed_activity_score(text,bigint,bigint) to service_role;

create or replace function public.korae_page_before_profile_pin(p_uid text, p_options jsonb default '{}', p_cursor jsonb default null, p_limit integer default 20)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare result jsonb; mode text := coalesce(p_options->>'mode','posts'); n integer := least(greatest(p_limit,1),100);
  ranking_at bigint := coalesce((p_cursor->>3)::bigint,floor(extract(epoch from statement_timestamp())*1000)::bigint);
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
        when '논쟁' then abs(coalesce((d.body->>'support')::bigint,0))+abs(coalesce((d.body->>'oppose')::bigint,0))
        when '급상승' then public.korae_feed_activity_score(d.id,ranking_at,coalesce((p_options->>'activitySince')::bigint,(p_options->>'since')::bigint,0))
        else coalesce((d.body->>'support')::bigint,0)-coalesce((d.body->>'oppose')::bigint,0) end as score
    from korae_documents d where d.kind='posts'
    and coalesce((d.body->>'createdAt')::bigint,0) <= coalesce((p_options->>'until')::bigint,(extract(epoch from now())*1000)::bigint)
    and (p_options->>'category'='급상승' or p_options->>'since' is null or (d.body->>'createdAt')::bigint >= (p_options->>'since')::bigint)
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
    'nextCursor',case when (select count(*) from candidates)>n then (select jsonb_build_array(score,stamp,id)||case when p_options->>'category'='급상승' then jsonb_build_array(ranking_at) else '[]'::jsonb end from page order by score,stamp,id desc limit 1) else null end)
  into result from enriched;
  return result;
end $$;


revoke all on function public.korae_page_before_profile_pin(text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.korae_page_before_profile_pin(text,jsonb,jsonb,integer) to service_role;
