-- All notification state is private. Only the Firebase-verified Edge API uses these RPCs.
create table public.korae_notification_preferences (
 uid text primary key, value jsonb not null, updated_at timestamptz not null default now()
);
create table public.korae_push_subscriptions (
 endpoint text primary key, uid text not null, subscription jsonb not null, updated_at timestamptz not null default now()
);
create index on public.korae_push_subscriptions(uid);
create table public.korae_notification_events (
 event_key text primary key, uid text not null, kind text not null check(kind in ('comment','repost','like','share','chat','checkin')),
 target text not null default '', created_at timestamptz not null default now()
);
create table public.korae_push_deliveries (
 id bigint generated always as identity primary key, event_key text not null references public.korae_notification_events on delete cascade,
 endpoint text not null references public.korae_push_subscriptions on delete cascade,
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_until timestamptz, lease_token uuid, done boolean not null default false,
 unique(event_key,endpoint)
);
create index on public.korae_push_deliveries(available_at) where not done;
alter table public.korae_notification_preferences enable row level security;
alter table public.korae_push_subscriptions enable row level security;
alter table public.korae_notification_events enable row level security;
alter table public.korae_push_deliveries enable row level security;
revoke all on public.korae_notification_preferences,public.korae_push_subscriptions,public.korae_notification_events,public.korae_push_deliveries from public,anon,authenticated;
grant all on public.korae_notification_preferences,public.korae_push_subscriptions,public.korae_notification_events,public.korae_push_deliveries to service_role;
grant usage,select on sequence public.korae_push_deliveries_id_seq to service_role;

create function public.korae_enqueue_notification(k text,u text,t text,target_id text default '') returns void
language plpgsql set search_path=public,pg_temp as $$
begin
 if u is null or not exists(select 1 from korae_notification_preferences where uid=u and value->>'enabled'='true' and value->>t='true') then return;end if;
 insert into korae_notification_events(event_key,uid,kind,target) values(k,u,t,target_id) on conflict do nothing;
 if not found then return;end if;
 insert into korae_push_deliveries(event_key,endpoint) select k,endpoint from korae_push_subscriptions where uid=u;
end $$;

create function public.korae_notification_activity() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare recipient text; actor text; target_id text; event_kind text; event_id text;
begin
 actor:=new.owner;
 if new.kind='comments' then event_kind:='comment';target_id:=new.parent;event_id:=new.parent||':'||new.id;
 elsif new.kind='likes' then event_kind:='like';target_id:=new.parent;actor:=new.id;event_id:=new.parent||':'||new.id||':'||floor(extract(epoch from now())/86400)::text;
 elsif new.kind='reposts' then event_kind:='repost';target_id:=new.parent;actor:=new.id;event_id:=new.parent||':'||new.id||':'||floor(extract(epoch from now())/86400)::text;
 elsif new.kind='messages' then event_kind:='chat';target_id:=new.body->>'senderId';actor:=target_id;recipient:=new.body->>'recipientId';event_id:=new.parent||':'||new.id;
 else return new;end if;
 if recipient is null then select owner into recipient from korae_documents where kind='posts' and parent='' and id=target_id;end if;
 if recipient is not null and recipient<>actor then perform korae_enqueue_notification(event_kind||':'||event_id,recipient,event_kind,target_id);end if;
 return new;
end $$;
create trigger korae_notification_activity after insert on public.korae_documents for each row
 when(new.kind in ('comments','likes','reposts','messages')) execute function public.korae_notification_activity();

create function public.korae_notification_settings(p_uid text,p_action text,p_value jsonb default '{}') returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare value jsonb; endpoint_value text; recipient text; target_id text; entry record;
begin
 if p_action='recordShare' then
  target_id:=p_value->>'postId';
  select owner into recipient from korae_documents where kind='posts' and parent='' and id=target_id;
  if recipient is not null and recipient is distinct from p_uid then
   -- At most one share notification per actor/post/day; anonymous shares are grouped.
   perform korae_enqueue_notification('share:'||target_id||':'||coalesce(p_uid,'guest')||':'||floor(extract(epoch from now())/86400)::text,recipient,'share',target_id);
  end if;return 'null';
 end if;
 if p_uid is null or p_uid='' then raise exception 'Authentication required';end if;
 if p_action='get' then select p.value into value from korae_notification_preferences p where uid=p_uid;return coalesce(value,'{}');
 elsif p_action='save' then
  if jsonb_typeof(p_value)<>'object' then raise exception 'Invalid preferences';end if;
  for entry in select * from jsonb_each(p_value) loop
   if entry.key not in ('enabled','comment','repost','like','share','chat','checkin') or jsonb_typeof(entry.value)<>'boolean' then raise exception 'Invalid preferences';end if;
  end loop;
  insert into korae_notification_preferences(uid,value) values(p_uid,p_value) on conflict(uid) do update set value=excluded.value,updated_at=now();
  -- Disabled notifications are discarded, never replayed on re-enabling.
  update korae_push_deliveries d set done=true from korae_notification_events e where e.event_key=d.event_key and e.uid=p_uid and (p_value->>'enabled' is distinct from 'true' or p_value->>e.kind is distinct from 'true');
  return p_value;
 elsif p_action='subscribe' then
  endpoint_value:=p_value->>'endpoint';
  perform pg_advisory_xact_lock(hashtextextended(endpoint_value,7));
  -- Rebinding a browser to another account removes deliveries for the old account.
  delete from korae_push_subscriptions where endpoint=endpoint_value and uid<>p_uid;
  if not exists(select 1 from korae_push_subscriptions where endpoint=endpoint_value) and (select count(*) from korae_push_subscriptions where uid=p_uid)>=10 then raise exception '알림 기기는 최대 10개까지 등록할 수 있습니다.';end if;
  insert into korae_push_subscriptions(endpoint,uid,subscription) values(endpoint_value,p_uid,p_value)
   on conflict(endpoint) do update set subscription=excluded.subscription,updated_at=now();
  return 'null';
 elsif p_action='unsubscribe' then
  delete from korae_push_subscriptions where uid=p_uid and endpoint=p_value->>'endpoint';return 'null';
 end if;
 raise exception 'Unknown notification action';
end $$;

-- Same KST day calculation as korae_mutate(checkin). One reminder per completed check-in.
create function public.korae_queue_due_checkins() returns void language plpgsql set search_path=public,pg_temp as $$
declare row record; today integer:=floor((extract(epoch from now())+32400)/86400)::integer;
begin
 for row in select d.id,(d.body->>'day')::integer as day from korae_documents d join korae_notification_preferences p on p.uid=d.id
  where d.kind='balances' and d.parent='' and coalesce((d.body->>'day')::integer,-1)>=0
   and (d.body->>'day')::integer=today-1 and p.value->>'enabled'='true' and p.value->>'checkin'='true'
 loop perform korae_enqueue_notification('checkin:'||row.id||':'||(row.day+1)::text,row.id,'checkin');end loop;
end $$;

create function public.korae_claim_push(p_limit integer default 50) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare result jsonb;
begin
 -- Recheck preferences and account ownership at send time; expire stale notifications.
 update korae_push_deliveries d set done=true where not done and exists(
  select 1 from korae_notification_events e left join korae_notification_preferences p on p.uid=e.uid
  left join korae_push_subscriptions s on s.endpoint=d.endpoint
  where e.event_key=d.event_key and (p.value->>'enabled' is distinct from 'true' or p.value->>e.kind is distinct from 'true' or s.uid is distinct from e.uid or e.created_at<now()-interval '24 hours'
   or (e.kind='checkin' and exists(select 1 from korae_documents b where b.kind='balances' and b.id=e.uid and (b.body->>'day')::integer>=floor((extract(epoch from now())+32400)/86400)))
   or (e.kind='chat' and (not exists(select 1 from korae_documents f where f.kind='following' and f.parent=e.uid and f.id=e.target) or not exists(select 1 from korae_documents f where f.kind='following' and f.parent=e.target and f.id=e.uid)))));
 with picked as (
  select id from korae_push_deliveries where not done and attempts<5 and available_at<=now() and (lease_until is null or lease_until<now()) order by id for update skip locked limit least(greatest(p_limit,1),100)
 ), claimed as (
  update korae_push_deliveries d set attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid()
  from picked where d.id=picked.id returning d.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'lease',c.lease_token,'event_key',e.event_key,'kind',e.kind,'target',e.target,'subscription',s.subscription)),'[]')
 into result from claimed c join korae_notification_events e using(event_key) join korae_push_subscriptions s using(endpoint);
 return result;
end $$;
create function public.korae_finish_push(p_id bigint,p_lease uuid,p_status integer) returns void language plpgsql set search_path=public,pg_temp as $$
declare endpoint_value text;
begin
 if p_status in (404,410) then
  select endpoint into endpoint_value from korae_push_deliveries where id=p_id and lease_token=p_lease;
  delete from korae_push_subscriptions where endpoint=endpoint_value;
 else
  update korae_push_deliveries set done=(p_status between 200 and 299 or attempts>=5),lease_until=null,
   available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer))
   where id=p_id and lease_token=p_lease;
 end if;
end $$;
revoke all on function public.korae_enqueue_notification(text,text,text,text),public.korae_notification_activity(),public.korae_notification_settings(text,text,jsonb),public.korae_queue_due_checkins(),public.korae_claim_push(integer),public.korae_finish_push(bigint,uuid,integer) from public,anon,authenticated;
grant execute on function public.korae_enqueue_notification(text,text,text,text),public.korae_notification_settings(text,text,jsonb),public.korae_queue_due_checkins(),public.korae_claim_push(integer),public.korae_finish_push(bigint,uuid,integer) to service_role;
