-- KK policy v1. Existing balances/history are preserved; enrollment grants 100 KK once.
create table public.korae_points_policy(id integer primary key check(id=1), body jsonb not null);
insert into public.korae_points_policy values(1,'{"version":1,"welcome":100,"attendance":20,"missionReward":100,"mission":{"posts":3,"games":5,"comments":5},"minimumGameSeconds":10,"costs":{"posts":10,"reposts":10,"pins":10,"comments":2,"likes":0,"messages":0,"following":0,"battle":0},"streaks":{"10":100,"30":500,"100":3000,"365":10000},"levels":[{"name":"새우","days":0,"bp":0,"posts":0,"reposts":0,"games":0,"likes":0,"bonus":0,"pins":3,"avatar":"새우 아이콘","cover":"기본색","friends":3,"dm":3,"images":0},{"name":"게","days":7,"bp":300,"posts":3,"reposts":1,"games":20,"likes":5,"bonus":5,"pins":3,"avatar":"게 아이콘","cover":"기본색","friends":10,"dm":10,"images":1},{"name":"오징어","days":30,"bp":1000,"posts":10,"reposts":5,"games":100,"likes":20,"bonus":10,"pins":3,"avatar":"오징어 아이콘","cover":"기본색","friends":20,"dm":20,"images":1},{"name":"문어","days":60,"bp":3000,"posts":30,"reposts":15,"games":200,"likes":50,"bonus":20,"pins":3,"avatar":"문어 아이콘 또는 이미지 + 뱃지","cover":"이미지","friends":50,"dm":50,"images":2},{"name":"돌고래","days":100,"bp":10000,"posts":80,"reposts":40,"games":400,"likes":200,"bonus":30,"pins":3,"avatar":"돌고래 아이콘 또는 이미지 + 뱃지","cover":"이미지","friends":100,"dm":100,"images":3},{"name":"상어","days":200,"bp":30000,"posts":200,"reposts":100,"games":1000,"likes":500,"bonus":50,"pins":3,"avatar":"상어 아이콘 또는 이미지 + 뱃지","cover":"이미지","friends":null,"dm":null,"images":3},{"name":"고래","days":365,"bp":100000,"posts":500,"reposts":250,"games":2000,"likes":2000,"bonus":100,"pins":5,"avatar":"황금 고래 아이콘 또는 이미지 + 뱃지","cover":"이미지","friends":null,"dm":null,"images":5}]}'::jsonb);
alter table public.korae_points_policy enable row level security;
revoke all on public.korae_points_policy from public,anon,authenticated;
grant select on public.korae_points_policy to service_role;
create table public.korae_point_events(uid text not null, action text not null, event_key text not null, delta integer not null default 0, created_at timestamptz not null default now(), primary key(uid,action,event_key));
alter table public.korae_point_events enable row level security;
revoke all on public.korae_point_events from public,anon,authenticated;
grant all on public.korae_point_events to service_role;
create function public.korae_points_level(b jsonb) returns integer language plpgsql stable set search_path=public,pg_temp as $$
declare config jsonb; l jsonb; i integer:=0; earned integer:=least(6,greatest(0,coalesce((b->>'level')::integer,0))); s jsonb:=coalesce(b->'stats','{}');
begin
 select body into config from korae_points_policy where id=1;
 for l in select value from jsonb_array_elements(config->'levels') loop
  if coalesce((b->>'lifetime')::bigint,0)>=(l->>'bp')::bigint
   and coalesce((s->>'days')::bigint,0)>=(l->>'days')::bigint
   and coalesce((s->>'posts')::bigint,0)>=(l->>'posts')::bigint
   and coalesce((s->>'reposts')::bigint,0)>=(l->>'reposts')::bigint
   and coalesce((s->>'games')::bigint,0)>=(l->>'games')::bigint
   and coalesce((s->>'likes')::bigint,0)>=(l->>'likes')::bigint then earned:=greatest(earned,i); end if;
  i:=i+1;
 end loop;
 return earned;
end $$;
create function public.korae_points_save(p_uid text,b jsonb) returns jsonb language plpgsql set search_path=public,pg_temp as $$
begin
 b:=b||jsonb_build_object('level',korae_points_level(b),'updatedAt',floor(extract(epoch from clock_timestamp())*1000)::bigint);
 insert into korae_documents values('balances',p_uid,'',p_uid,b) on conflict(kind,parent,id) do update set body=excluded.body returning body into b;
 return b;
end $$;
create function public.korae_points_init(p_uid text) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare b jsonb; config jsonb; welcome integer;
begin
 if p_uid is null or p_uid='' then raise exception '로그인이 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_uid,0));
 select body into b from korae_documents where kind='balances' and parent='' and id=p_uid;
 if b->>'policyVersion'='1' then return b; end if;
 select body into config from korae_points_policy where id=1;
 welcome:=case when exists(select 1 from korae_point_events where uid=p_uid and action='welcome' and event_key='v1') then 0 else (config->>'welcome')::integer end;
 b:=coalesce(b,'{}')||jsonb_build_object('policyVersion',1,'current',coalesce((b->>'current')::bigint,0)+welcome,'lifetime',coalesce((b->>'lifetime')::bigint,0)+welcome,'day',coalesce((b->>'day')::integer,-1),'streak',0,'stats',jsonb_build_object('days',jsonb_array_length(coalesce(b->'checkinDays','[]')),'posts',0,'reposts',0,'games',0,'likes',0));
 insert into korae_point_events values(p_uid,'welcome','v1',(config->>'welcome')::integer,now()) on conflict do nothing;
 return korae_points_save(p_uid,b);
end $$;
-- Import only activity that can actually be proven from retained records.
do $$
declare u text; b jsonb; s jsonb; d integer; streak integer;
begin
 for u in select distinct id from korae_documents where kind in ('profiles','balances') and parent='' loop
  b:=korae_points_init(u); s:=b->'stats';
  s:=s||jsonb_build_object(
   'posts',(select count(*) from korae_documents where kind='posts' and owner=u and body->>'originalPostId' is null),
   'reposts',(select count(*) from korae_documents where kind='reposts' and id=u),
   'games',0,
   'likes',(select count(*) from korae_documents l join korae_documents p on p.kind='posts' and p.id=l.parent and p.parent='' where l.kind='likes' and p.owner=u and l.id<>u));
  -- Old battle aggregates include zero-duration rounds, so they cannot prove eligible plays.
  d:=coalesce((b->>'day')::integer,-1); streak:=0;
  while coalesce(b->'checkinDays','[]') @> to_jsonb(array[d]) and streak<365 loop streak:=streak+1;d:=d-1;end loop;
  perform korae_points_save(u,b||jsonb_build_object('stats',s,'streak',streak));
 end loop;
end $$;
insert into korae_point_events(uid,action,event_key)
 select owner,case when body->>'originalPostId' is null then 'posts' else 'reposts' end,id from korae_documents where kind='posts'
 union all select p.owner,'likes',l.parent||':'||l.id from korae_documents l join korae_documents p on p.kind='posts' and p.id=l.parent and p.parent='' where l.kind='likes' and l.id<>p.owner
 on conflict do nothing;

-- Runs inside the same transaction as the activity. Any failure rolls everything back.
create function public.korae_points_event(p_uid text,p_action text,p_key text,p_cost integer,p_metric text default null,p_mission_key text default null) returns void language plpgsql set search_path=public,pg_temp as $$
declare b jsonb; s jsonb; m jsonb; config jsonb; today integer:=floor((extract(epoch from clock_timestamp())+32400)/86400)::integer; reward integer; qualifies boolean:=false;
begin
 b:=korae_points_init(p_uid);
 insert into korae_point_events(uid,action,event_key,delta) values(p_uid,p_action,p_key,-p_cost) on conflict do nothing;
 if not found then return; end if;
 if (b->>'current')::bigint<p_cost then raise exception 'KK가 부족합니다. 출석체크로 KK를 모아 주세요. (필요: % KK)',p_cost; end if;
 b:=jsonb_set(b,'{current}',to_jsonb((b->>'current')::bigint-p_cost));
 s:=b->'stats';
 if p_metric is not null then s:=s||jsonb_build_object(p_metric,coalesce((s->>p_metric)::bigint,0)+1);end if;
 b:=b||jsonb_build_object('stats',s);
 select body into config from korae_points_policy where id=1;
 m:=case when b->'mission'->>'day'=today::text then b->'mission' else jsonb_build_object('day',today,'posts',0,'comments',0,'games',0,'claimed',false) end;
 if p_mission_key is not null and p_metric in ('posts','comments','games') then
  insert into korae_point_events(uid,action,event_key) values(p_uid,'mission-'||p_metric,today::text||':'||p_mission_key) on conflict do nothing;
  qualifies:=found;
  if qualifies then m:=m||jsonb_build_object(p_metric,least((config->'mission'->>p_metric)::integer,coalesce((m->>p_metric)::integer,0)+1));end if;
 end if;
 if not coalesce((m->>'claimed')::boolean,false) and (m->>'posts')::integer>=(config->'mission'->>'posts')::integer and (m->>'comments')::integer>=(config->'mission'->>'comments')::integer and (m->>'games')::integer>=(config->'mission'->>'games')::integer then
  reward:=(config->>'missionReward')::integer;
  insert into korae_point_events(uid,action,event_key,delta) values(p_uid,'mission-reward',today::text,reward) on conflict do nothing;
  if found then b:=b||jsonb_build_object('current',(b->>'current')::bigint+reward,'lifetime',(b->>'lifetime')::bigint+reward);end if;
  m:=m||jsonb_build_object('claimed',true);
 end if;
 perform korae_points_save(p_uid,b||jsonb_build_object('mission',m));
end $$;

create function public.korae_points_activity() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare config jsonb; action text; metric text; key text; mission_key text; recipient text; cost integer:=0;
begin
 select body into config from korae_points_policy where id=1;
 if new.kind='profiles' then perform korae_points_init(new.id);return new;
 elsif new.kind='posts' then
  action:=case when new.body->>'originalPostId' is null then 'posts' else 'reposts' end;metric:=action;key:=new.id;
  if action='posts' and length(trim(new.body->>'content'))>=10 then mission_key:=md5(regexp_replace(trim(new.body->>'content'),'\s+',' ','g'));end if;
 elsif new.kind='comments' then action:='comments';metric:='comments';key:=new.parent||':'||new.id;
  if length(trim(new.body->>'content'))>=5 then mission_key:=new.parent;end if;
 elsif new.kind='pins' then action:='pins';key:=gen_random_uuid()::text;
 elsif new.kind='likes' then
  select owner into recipient from korae_documents where kind='posts' and parent='' and id=new.parent;
  if recipient is not null and recipient<>new.id then perform korae_points_event(recipient,'likes',new.parent||':'||new.id,0,'likes');end if;
  return new;
 else return new;
 end if;
 cost:=coalesce((config->'costs'->>action)::integer,0);
 perform korae_points_event(new.owner,action,key,cost,metric,mission_key);
 return new;
end $$;
create trigger korae_points_activity after insert on public.korae_documents for each row when (new.kind in ('profiles','posts','comments','pins','likes')) execute function korae_points_activity();
create function public.korae_points_game() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare g jsonb:=new.body->'progress'->'game'; config jsonb; key text;
begin
 if not coalesce((g->>'ended')::boolean,false) or (coalesce((old.body->'progress'->'game'->>'ended')::boolean,false) and old.body->'progress'->>'round'=new.body->'progress'->>'round' and old.body->>'id'=new.body->>'id') then return new;end if;
 select body into config from korae_points_policy where id=1;
 if coalesce((g->>'time')::numeric,0)<(config->>'minimumGameSeconds')::integer or coalesce((g->>'score')::bigint,0)<1 then return new;end if;
 key:=(new.body->>'id')||':'||coalesce(new.body->'progress'->>'round','0');
 perform korae_points_event(new.owner,'games',key,0,'games',key);
 return new;
end $$;
create trigger korae_points_game after update on public.korae_documents for each row when(new.kind='battleSessions') execute function korae_points_game();

alter function public.korae_mutate(text,text,text,jsonb) rename to korae_mutate_before_points;
create function public.korae_mutate(p_action text,p_uid text,p_id text default '',p_value jsonb default '{}') returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare b jsonb; config jsonb; today integer:=floor((extract(epoch from clock_timestamp())+32400)/86400)::integer; streak integer; reward integer; bonus integer; milestone integer; slot integer; target text; value jsonb;
begin
 if p_action in ('pointsBalance','checkin','savePin') then
  b:=korae_points_init(p_uid);select body into config from korae_points_policy where id=1;
  if p_action='pointsBalance' then return b;
  elsif p_action='checkin' then
   if coalesce((b->>'day')::integer,-1)>=today then return b;end if;
   streak:=case when (b->>'day')::integer=today-1 and (b->>'streak')::integer<365 then (b->>'streak')::integer+1 else 1 end;
   bonus:=(config->'levels'->korae_points_level(b)->>'bonus')::integer;
   milestone:=coalesce((config->'streaks'->>streak::text)::integer,0);
   reward:=(config->>'attendance')::integer+bonus+milestone;
   b:=b||jsonb_build_object('current',(b->>'current')::bigint+reward,'lifetime',(b->>'lifetime')::bigint+reward,'day',today,'streak',streak,'lastCheckinReward',reward,'lastCheckinBonus',bonus,'lastStreakReward',milestone,'stats',(b->'stats')||jsonb_build_object('days',coalesce((b->'stats'->>'days')::bigint,0)+1));
   insert into korae_point_events(uid,action,event_key,delta) values(p_uid,'checkin',today::text,reward);
   return korae_points_save(p_uid,b);
  elsif p_action='savePin' and p_id='' then
   select n into slot from generate_series(0,(config->'levels'->korae_points_level(b)->>'pins')::integer-1) n where not exists(select 1 from korae_documents where kind='pins' and id=p_uid||'_'||n::text) order by n limit 1;
   if slot is null then raise exception '현재 등급의 마커 생성 한도에 도달했습니다.';end if;
   target:=p_uid||'_'||slot::text;value:=p_value||jsonb_build_object('ownerId',p_uid,'slot',slot::text);
   insert into korae_documents values('pins',target,'',p_uid,value);
   return value||jsonb_build_object('id',target,'owner',true);
  end if;
 end if;
 return public.korae_mutate_before_points(p_action,p_uid,p_id,p_value);
end $$;
revoke all on function public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_points(text,text,text,jsonb),public.korae_points_level(jsonb),public.korae_points_save(text,jsonb),public.korae_points_init(text),public.korae_points_event(text,text,text,integer,text,text),public.korae_points_activity(),public.korae_points_game() from public,anon,authenticated;
grant execute on function public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_points(text,text,text,jsonb),public.korae_points_level(jsonb),public.korae_points_save(text,jsonb),public.korae_points_init(text),public.korae_points_event(text,text,text,integer,text,text),public.korae_points_activity(),public.korae_points_game() to service_role;
