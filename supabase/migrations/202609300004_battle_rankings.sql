-- Compact per-feed aggregates; no full history scan when opening the leaderboard.
create table if not exists public.korae_battle_totals (
  post_id text primary key, participants bigint not null default 0,
  support bigint not null default 0, oppose bigint not null default 0
);
create table if not exists public.korae_battle_contributors (
  post_id text not null references public.korae_battle_totals(post_id) on delete cascade,
  user_id text not null, support bigint not null default 0 check(support>=0),
  oppose bigint not null default 0 check(oppose>=0), games bigint not null check(games>0),
  last_completed_at bigint not null,
  total bigint generated always as (support+oppose) stored,
  primary key(post_id,user_id)
);
create index if not exists korae_battle_ranking on public.korae_battle_contributors(post_id,total desc,user_id);
alter table public.korae_battle_totals enable row level security;
alter table public.korae_battle_contributors enable row level security;
revoke all on public.korae_battle_totals,public.korae_battle_contributors from public,anon,authenticated;
grant all on public.korae_battle_totals,public.korae_battle_contributors to service_role;

do $$ begin
  if to_regprocedure('public.korae_mutate_before_battle_rankings(text,text,text,jsonb)') is null then
    alter function public.korae_mutate(text,text,text,jsonb) rename to korae_mutate_before_battle_rankings;
  end if;
end $$;
create or replace function public.korae_mutate(p_action text,p_uid text,p_id text default '',p_value jsonb default '{}')
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare session jsonb; result jsonb; original text; target text; score bigint; games bigint; stamp bigint;
  positive bigint; negative bigint; is_new boolean;
begin
  if p_uid is null or p_uid='' then raise exception '로그인이 필요합니다.'; end if;
  if p_action in ('applyBattle','finishBattle','battleProgress') then
    perform pg_advisory_xact_lock(hashtextextended(p_uid,0));
    select body into session from korae_documents where kind='battleSessions' and parent='' and id=p_uid for update;
    if session is null or session->>'id'<>p_id then raise exception '진행 중인 배틀이 아닙니다.'; end if;
    if p_action='battleProgress' then
      -- Timestamp the verified final tick, not a delayed click on Exit.
      if (p_value->'next'->'game'->>'ended')::boolean and not coalesce((session->'progress'->'game'->>'ended')::boolean,false) then
        p_value:=jsonb_set(p_value,'{next,lastCompletedAt}',to_jsonb(floor(extract(epoch from clock_timestamp())*1000)::bigint));
      end if;
      return public.korae_mutate_before_battle_rankings(p_action,p_uid,p_id,p_value);
    end if;
    if session->>'status'='finished' then return session->'result'; end if;
    select body->>'originalPostId' into original from korae_documents where kind='posts' and parent='' and id=session->>'postId';
    result:=public.korae_mutate_before_battle_rankings(p_action,p_uid,p_id,p_value);
    score:=(result->>'score')::bigint;
    games:=case when session->>'protocol'='2' then coalesce((session->'progress'->>'round')::bigint,0)+1 else 1 end;
    stamp:=coalesce((session->'progress'->>'lastCompletedAt')::bigint,floor(extract(epoch from clock_timestamp())*1000)::bigint);
    positive:=case when session->>'side'='support' then score else 0 end;
    negative:=case when session->>'side'='oppose' then score else 0 end;
    -- A repost contributes to both its own feed and its canonical original.
    for target in select distinct x from unnest(array[session->>'postId',original]) x where x is not null order by x loop
      insert into korae_battle_totals(post_id) values(target) on conflict do nothing;
      perform 1 from korae_battle_totals where post_id=target for update;
      is_new:=not exists(select 1 from korae_battle_contributors where post_id=target and user_id=p_uid);
      insert into korae_battle_contributors(post_id,user_id,support,oppose,games,last_completed_at)
        values(target,p_uid,positive,negative,games,stamp)
        on conflict(post_id,user_id) do update set support=korae_battle_contributors.support+excluded.support,
          oppose=korae_battle_contributors.oppose+excluded.oppose,games=korae_battle_contributors.games+excluded.games,
          last_completed_at=greatest(korae_battle_contributors.last_completed_at,excluded.last_completed_at);
      update korae_battle_totals set participants=participants+case when is_new then 1 else 0 end,
        support=support+positive,oppose=oppose+negative where post_id=target;
    end loop;
    return result;
  elsif p_action='deletePost' then
    -- The delegated mutation checks ownership; a failure rolls back this cleanup.
    delete from korae_battle_totals where post_id=p_id or post_id in
      (select id from korae_documents where kind='posts' and body->>'originalPostId'=p_id);
  elsif p_action='repost' and p_value->>'enabled'='false' then
    select coalesce(body->>'originalPostId',id) into original from korae_documents where kind='posts' and parent='' and id=p_value->>'postId';
    delete from korae_battle_totals where post_id='repost_'||md5(original||':'||p_uid);
  end if;
  return public.korae_mutate_before_battle_rankings(p_action,p_uid,p_id,p_value);
end $$;

create or replace function public.korae_battle_rankings(p_post text,p_uid text default null,p_cursor jsonb default null)
returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare result jsonb; totals jsonb; mine jsonb;
begin
  if not exists(select 1 from korae_documents where kind='posts' and parent='' and id=p_post) then raise exception '삭제된 피드입니다.'; end if;
  select jsonb_build_object('participants',participants,'total',support+oppose) into totals from korae_battle_totals where post_id=p_post;
  with top as materialized (
    select * from korae_battle_contributors where post_id=p_post order by total desc,user_id limit 100
  ), ranked as (
    select *,row_number() over(order by total desc,user_id) as rank from top
  ), candidates as (
    select * from ranked where p_cursor is null or total<(p_cursor->>0)::bigint or (total=(p_cursor->>0)::bigint and user_id>p_cursor->>1)
    order by total desc,user_id limit 21
  ), page as (select * from candidates order by total desc,user_id limit 20), enriched as (
    select r.*,jsonb_build_object('userId',user_id,'rank',rank,'support',support,'oppose',oppose,'total',total,'games',games,'lastCompletedAt',last_completed_at,
      'username',coalesce(p.body->>'username','회원'),'profileImage',coalesce(p.body->>'profileImage','')) as value
    from page r left join korae_documents p on p.kind='profiles' and p.parent='' and p.id=r.user_id
  ) select jsonb_build_object('items',coalesce(jsonb_agg(value order by rank),'[]'),
    'nextCursor',case when (select count(*) from candidates)>20 then (select jsonb_build_array(total,user_id) from page order by total,user_id desc limit 1) else null end)
    into result from enriched;
  select jsonb_build_object('userId',c.user_id,'rank',1+(select count(*) from korae_battle_contributors other where other.post_id=p_post and (other.total>c.total or (other.total=c.total and other.user_id<c.user_id))),
    'support',c.support,'oppose',c.oppose,'total',c.total,'games',c.games,'lastCompletedAt',c.last_completed_at,
    'username',coalesce(p.body->>'username','회원'),'profileImage',coalesce(p.body->>'profileImage','')) into mine
    from korae_battle_contributors c left join korae_documents p on p.kind='profiles' and p.parent='' and p.id=c.user_id where c.post_id=p_post and c.user_id=p_uid;
  return result||jsonb_build_object('summary',coalesce(totals,'{"participants":0,"total":0}'::jsonb),'mine',mine);
end $$;
revoke all on function public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_battle_rankings(text,text,text,jsonb),public.korae_battle_rankings(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_battle_rankings(text,text,text,jsonb),public.korae_battle_rankings(text,text,jsonb) to service_role;
