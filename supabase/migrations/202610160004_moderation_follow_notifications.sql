alter table public.korae_notification_inbox add column details jsonb not null default '{}';
alter table public.korae_notification_events drop constraint korae_notification_events_kind_check;
alter table public.korae_notification_events add constraint korae_notification_events_kind_check check(kind in ('comment','reply','repost','like','share','chat','checkin','report','moderation','follow'));
do $$ begin
 execute replace(pg_get_functiondef('public.korae_notification_settings(text,text,jsonb)'::regprocedure),'''enabled'',''comment''','''enabled'',''report'',''moderation'',''follow'',''comment''');
 execute replace(pg_get_functiondef('public.korae_notification_inbox_page(text,bigint)'::regprocedure),'''createdAt'',created_at','''createdAt'',created_at,''details'',details,''unavailable'',(kind=''moderation'' or (kind not in (''follow'',''chat'',''checkin'') and not korae_content_visible(case when details->>''contentKind''=''pins'' then ''pins'' else ''posts'' end,target)))');
end $$;
-- Private notices contain no reporter identity. Only deletion notices bypass preferences.
create function public.korae_content_notice(k text,u text,t text,target_id text,info jsonb,mandatory boolean default false) returns void language plpgsql set search_path=public,pg_temp as $$
begin
 if u is null then return;end if;
 if mandatory or exists(select 1 from korae_notification_preferences where uid=u and value->>'enabled'='true' and value->>t='true') then
 insert into korae_notification_inbox(uid,event_key,kind,target,details) values(u,k,t,target_id,info) on conflict(uid,event_key) do nothing;
 end if;
 perform korae_enqueue_notification(k,u,t,target_id);
end $$;
create function public.korae_report_notice() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare item record; report record;
begin
 select * into report from korae_report_targets where id=new.target_id;
 select * into item from korae_documents where kind=report.kind and id=report.target and parent='';
 perform korae_content_notice('report:'||gen_random_uuid()::text,item.owner,'report',report.target,jsonb_build_object('contentKind',report.kind,'summary',left(coalesce(item.body->>'title',item.body->>'content',''),180)));
 return new;
end $$;
create trigger korae_report_notice after insert on public.korae_reports for each row execute function public.korae_report_notice();
create function public.korae_moderation_notice() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare item record;
begin
 if not new.hidden then return new;end if;
 if tg_op='UPDATE' and old.hidden then return new;end if;
 select * into item from korae_documents where kind=new.kind and id=new.target and parent='';
 perform korae_content_notice('moderation:'||gen_random_uuid()::text,item.owner,'moderation',new.target,jsonb_build_object('contentKind',new.kind,'summary',left(coalesce(item.body->>'title',item.body->>'content',''),180)),true);
 return new;
end $$;
create trigger korae_moderation_notice after insert or update on public.korae_content_moderation for each row execute function public.korae_moderation_notice();
create function public.korae_follow_notice() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.parent<>new.id then
 perform korae_content_notice('follow:'||new.parent||':'||new.id||':'||floor(extract(epoch from now())/86400)::text,new.id,'follow',new.parent,'{}');
 end if;
 return new;
end $$;
create trigger korae_follow_notice after insert on public.korae_documents for each row when(new.kind='following') execute function public.korae_follow_notice();
revoke all on function public.korae_content_notice(text,text,text,text,jsonb,boolean),public.korae_report_notice(),public.korae_moderation_notice(),public.korae_follow_notice() from public,anon,authenticated;
grant execute on function public.korae_content_notice(text,text,text,text,jsonb,boolean),public.korae_report_notice(),public.korae_moderation_notice(),public.korae_follow_notice() to service_role;
