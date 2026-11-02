begin;
update public.korae_points_policy set body='{"version":3,"welcome":100,"attendance":20,"missionReward":100,"mission":{"posts":1,"games":5,"comments":5},"missionRewards":{"posts":20,"games":40,"comments":40},"minimumGameSeconds":10,"costs":{"posts":10,"reposts":10,"pins":10,"comments":2,"likes":0,"messages":0,"following":0,"battle":0},"streaks":{"10":100,"30":500,"100":3000,"365":10000},"levels":[{"name":"새우","days":0,"bp":0,"posts":0,"reposts":0,"games":0,"likes":0,"bonus":0,"pins":0,"avatar":"흑백","cover":"기본색","friends":3,"dm":3,"images":0},{"name":"게","days":7,"bp":300,"posts":3,"reposts":1,"games":20,"likes":0,"bonus":5,"pins":1,"avatar":"컬러","cover":"기본색","friends":10,"dm":10,"images":1},{"name":"오징어","days":30,"bp":1000,"posts":10,"reposts":5,"games":100,"likes":20,"bonus":10,"pins":2,"avatar":"컬러","cover":"기본색","friends":20,"dm":20,"images":1},{"name":"문어","days":60,"bp":3000,"posts":30,"reposts":15,"games":200,"likes":50,"bonus":20,"pins":2,"avatar":"컬러","cover":"이미지","friends":50,"dm":50,"images":2},{"name":"돌고래","days":100,"bp":10000,"posts":80,"reposts":40,"games":400,"likes":200,"bonus":30,"pins":3,"avatar":"컬러","cover":"이미지","friends":100,"dm":100,"images":3},{"name":"상어","days":200,"bp":30000,"posts":200,"reposts":100,"games":1000,"likes":500,"bonus":50,"pins":3,"avatar":"컬러","cover":"이미지","friends":null,"dm":null,"images":3},{"name":"고래","days":365,"bp":65000,"posts":500,"reposts":250,"games":2000,"likes":2000,"bonus":100,"pins":5,"avatar":"컬러","cover":"이미지","friends":null,"dm":null,"images":5}]}'::jsonb where id=1;
create function public.korae_mission_rewards(p_uid text,b jsonb) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare m jsonb:=b->'mission'; config jsonb; metric text; amount integer; paid boolean;
 flags jsonb:='{}'; total integer:=0; legacy boolean;
 today integer:=floor((extract(epoch from clock_timestamp())+32400)/86400)::integer;
begin
 if m->>'day' is distinct from today::text then return b; end if;
 select body into config from korae_points_policy where id=1;
 legacy:=coalesce((m->>'claimed')::boolean,false) or exists(select 1 from korae_point_events where uid=p_uid and action='mission-reward' and event_key=today::text);
 foreach metric in array array['posts','games','comments'] loop
  amount:=(config->'missionRewards'->>metric)::integer;
  m:=m||jsonb_build_object(metric,least(coalesce((m->>metric)::integer,0),(config->'mission'->>metric)::integer));
  if not legacy and (m->>metric)::integer>=(config->'mission'->>metric)::integer then
   insert into korae_point_events(uid,action,event_key,delta) values(p_uid,'mission-reward-'||metric,today::text,amount) on conflict do nothing;
   if found then b:=b||jsonb_build_object('current',(b->>'current')::bigint+amount,'lifetime',(b->>'lifetime')::bigint+amount); end if;
  end if;
  paid:=legacy or exists(select 1 from korae_point_events where uid=p_uid and action='mission-reward-'||metric and event_key=today::text);
  flags:=flags||jsonb_build_object(metric,paid);
  if paid then total:=total+amount;end if;
 end loop;
 return b||jsonb_build_object('mission',m||jsonb_build_object('rewarded',flags,'rewardTotal',total,'claimed',total=(config->>'missionReward')::integer));
end $$;
revoke all on function public.korae_mission_rewards(text,jsonb) from public,anon,authenticated;

create or replace function public.korae_points_event(p_uid text,p_action text,p_key text,p_cost integer,p_metric text default null,p_mission_key text default null) returns void language plpgsql set search_path=public,pg_temp as $$
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
 perform korae_points_save(p_uid,korae_mission_rewards(p_uid,b||jsonb_build_object('mission',m)));
end $$;


-- Settle qualifying progress for today once, without re-paying the previous 100 KK bonus.
-- Re-evaluate ranks without resetting balances, counters or earned levels.
do $$
declare member record; b jsonb;
begin
 for member in select id from korae_documents where kind='balances' and parent='' order by id loop
  b:=korae_points_init(member.id);
  perform korae_points_save(member.id,korae_mission_rewards(member.id,b));
 end loop;
end $$;
commit;
