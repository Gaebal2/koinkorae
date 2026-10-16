alter table public.korae_notification_events drop constraint korae_notification_events_kind_check;
alter table public.korae_notification_events add constraint korae_notification_events_kind_check check(kind in ('comment','reply','repost','like','share','chat','checkin','report','moderation','follow','review'));
do $$ begin
 execute replace(pg_get_functiondef('public.korae_notification_settings(text,text,jsonb)'::regprocedure),'''enabled'',''report''','''enabled'',''review'',''report''');
 -- Serialize report, moderation and resolution for a content item.
 execute replace(pg_get_functiondef('public.korae_report_content(text,text,text)'::regprocedure),'begin','begin
 perform pg_advisory_xact_lock(hashtextextended(p_kind||'':''||p_id,19));');
 execute replace(pg_get_functiondef('public.korae_moderate_content(text,text,boolean,text,text,boolean)'::regprocedure),'begin','begin
 perform pg_advisory_xact_lock(hashtextextended(p_kind||'':''||p_id,19));');
end $$;
create function public.korae_dismiss_reports(p_uid text,p_email text,p_verified boolean,p_kind text,p_id text,p_report_id bigint) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare item record; recipient text; info jsonb;
begin
 if p_uid is null or p_verified is distinct from true or lower(coalesce(p_email,''))<>'gaebal2017@gmail.com' then raise exception '관리자만 사용할 수 있습니다.';end if;
 if p_kind not in ('posts','pins') or p_report_id is null then raise exception '잘못된 처리입니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_kind||':'||p_id,19));
 if not exists(select 1 from korae_report_targets where id=p_report_id and kind=p_kind and target=p_id) then return jsonb_build_object('dismissed',false);end if;
 select * into item from korae_documents where kind=p_kind and parent='' and id=p_id for update;
 if not found then raise exception '작성자가 삭제한 항목입니다.';end if;
 info:=jsonb_build_object('contentKind',p_kind,'summary',left(coalesce(item.body->>'title',item.body->>'content',''),180));
 update korae_content_moderation set hidden=false,updated_by=p_uid,updated_at=now() where kind=p_kind and target=p_id;
 for recipient in select reporter from korae_reports where target_id=p_report_id union select item.owner loop
  perform korae_content_notice('review:'||p_report_id::text||':'||recipient,recipient,'review',p_id,info,true);
 end loop;
 -- Recipients and snapshots are preserved in their private inboxes before closing the case.
 delete from korae_report_targets where id=p_report_id;
 perform realtime.send(jsonb_build_object('kind',p_kind,'id',p_id,'parent',''),'change','korae:public',true);
 return jsonb_build_object('dismissed',true);
end $$;
revoke all on function public.korae_dismiss_reports(text,text,boolean,text,text,bigint) from public,anon,authenticated;
grant execute on function public.korae_dismiss_reports(text,text,boolean,text,text,bigint) to service_role;
