-- Persist accepted push notifications independently of queue cleanup.
create table public.korae_notification_inbox (
 id bigint generated always as identity primary key,
 uid text not null,event_key text not null,kind text not null,target text not null,
 created_at timestamptz not null default now(),unique(uid,event_key)
);
create index on public.korae_notification_inbox(uid,id desc);
alter table public.korae_notification_inbox enable row level security;
revoke all on public.korae_notification_inbox from public,anon,authenticated;
grant all on public.korae_notification_inbox to service_role;
grant usage,select on sequence public.korae_notification_inbox_id_seq to service_role;
alter function public.korae_finish_push(bigint,uuid,integer) rename to korae_finish_push_before_inbox;
create function public.korae_finish_push(p_id bigint,p_lease uuid,p_status integer) returns void language plpgsql set search_path=public,pg_temp as $$
begin
 if p_status between 200 and 299 then
  insert into korae_notification_inbox(uid,event_key,kind,target,created_at)
  select e.uid,e.event_key,e.kind,e.target,e.created_at from korae_push_deliveries d
  join korae_notification_events e using(event_key)
  where d.id=p_id and d.lease_token=p_lease and not d.done
  on conflict(uid,event_key) do nothing;
 end if;
 perform korae_finish_push_before_inbox(p_id,p_lease,p_status);
end $$;
create function public.korae_notification_inbox_page(p_uid text,p_before bigint default null) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_uid is null or p_uid='' then raise exception 'Authentication required';end if;
 with batch as (select * from korae_notification_inbox where uid=p_uid and (p_before is null or id<p_before) order by id desc limit 21),
 page as (select * from batch order by id desc limit 20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id::text,'kind',kind,'target',target,'createdAt',created_at) order by id desc) from page),'[]'::jsonb),
 'nextCursor',case when (select count(*) from batch)>20 then (select min(id)::text from page) else null end) into result;
 return result;
end $$;
revoke all on function public.korae_finish_push(bigint,uuid,integer),public.korae_finish_push_before_inbox(bigint,uuid,integer),public.korae_notification_inbox_page(text,bigint) from public,anon,authenticated;
grant execute on function public.korae_finish_push(bigint,uuid,integer),public.korae_notification_inbox_page(text,bigint) to service_role;
