-- Administrator deletion is final; keep moderation tombstones and private notices.
create or replace function public.korae_moderate_content(p_uid text,p_email text,p_verified boolean,p_kind text,p_id text,p_hidden boolean) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare item record; affected text[];
begin
 if p_uid is null or p_verified is distinct from true or lower(coalesce(p_email,''))<>'gaebal2017@gmail.com' then raise exception '관리자만 사용할 수 있습니다.';end if;
 if p_hidden is distinct from true or p_kind not in ('posts','pins') then raise exception '삭제된 항목은 복원할 수 없습니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_kind||':'||p_id,19));
 select * into item from korae_documents where kind=p_kind and parent='' and id=p_id for update;
 if not found then
  if exists(select 1 from korae_content_moderation where kind=p_kind and target=p_id and hidden) then return jsonb_build_object('deleted',true);end if;
  raise exception '이미 삭제된 항목입니다.';
 end if;
 if not exists(select 1 from korae_report_targets where kind=p_kind and target=p_id) then raise exception '접수된 신고가 없습니다.';end if;
 -- Capture the author's notice before removing the content.
 insert into korae_content_moderation(kind,target,hidden,updated_by) values(p_kind,p_id,true,p_uid)
 on conflict(kind,target) do update set hidden=true,updated_by=excluded.updated_by,updated_at=now();
 if p_kind='posts' then
  select array_agg(id) into affected from korae_documents where kind='posts' and parent='' and (id=p_id or body->>'originalPostId'=p_id);
  -- Reuse the established cleanup of comments, likes, reposts, rankings and profile pins.
  perform korae_mutate('deletePost',item.owner,p_id,'{}');
  delete from korae_report_targets where kind='posts' and target=any(affected);
 else
  delete from korae_documents where kind='pins' and parent='' and id=p_id;
  delete from korae_report_targets where kind='pins' and target=p_id;
 end if;
 perform realtime.send(jsonb_build_object('kind',p_kind,'id',p_id,'parent',''),'change','korae:public',true);
 return jsonb_build_object('deleted',true);
end $$;

-- Dismissal may close an open case, but must never restore deleted content.
create or replace function public.korae_dismiss_reports(p_uid text,p_email text,p_verified boolean,p_kind text,p_id text,p_report_id bigint) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare item record; recipient text; info jsonb;
begin
 if p_uid is null or p_verified is distinct from true or lower(coalesce(p_email,''))<>'gaebal2017@gmail.com' then raise exception '관리자만 사용할 수 있습니다.';end if;
 if p_kind not in ('posts','pins') or p_report_id is null then raise exception '잘못된 처리입니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_kind||':'||p_id,19));
 if exists(select 1 from korae_content_moderation where kind=p_kind and target=p_id and hidden) then raise exception '삭제된 항목의 신고는 철회할 수 없습니다.';end if;
 if not exists(select 1 from korae_report_targets where id=p_report_id and kind=p_kind and target=p_id) then return jsonb_build_object('dismissed',false);end if;
 select * into item from korae_documents where kind=p_kind and parent='' and id=p_id for update;
 if not found then raise exception '이미 삭제된 항목입니다.';end if;
 info:=jsonb_build_object('contentKind',p_kind,'summary',left(coalesce(item.body->>'title',item.body->>'content',''),180));
 for recipient in select reporter from korae_reports where target_id=p_report_id union select item.owner loop
  perform korae_content_notice('review:'||p_report_id::text||':'||recipient,recipient,'review',p_id,info,true);
 end loop;
 delete from korae_report_targets where id=p_report_id;
 return jsonb_build_object('dismissed',true);
end $$;

-- Exclude historical administrator deletions before pagination as well.
create or replace function public.korae_admin_reports(p_uid text,p_email text,p_verified boolean,p_before bigint default null) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_uid is null or p_verified is distinct from true or lower(coalesce(p_email,''))<>'gaebal2017@gmail.com' then raise exception '관리자만 사용할 수 있습니다.';end if;
 with candidates as (
  select r.* from korae_report_targets r where (p_before is null or r.id<p_before)
  and not exists(select 1 from korae_content_moderation m where m.kind=r.kind and m.target=r.target and m.hidden)
  order by r.id desc limit 21
 ), page as (select * from candidates order by id desc limit 20)
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
  'reportId',p.id,'kind',p.kind,'targetId',p.target,'createdAt',p.created_at,
  'count',(select count(*) from korae_reports r where r.target_id=p.id),
  'hidden',false,'item',case when d.id is null then null else d.body||jsonb_build_object('id',d.id) end
 ) order by p.id desc),'[]'),'nextCursor',case when (select count(*) from candidates)>20 then (select min(id) from page) else null end)
 into result from page p left join korae_documents d on d.kind=p.kind and d.id=p.target and d.parent='';
 return result;
end $$;
revoke all on function public.korae_moderate_content(text,text,boolean,text,text,boolean),public.korae_dismiss_reports(text,text,boolean,text,text,bigint),public.korae_admin_reports(text,text,boolean,bigint) from public,anon,authenticated;
grant execute on function public.korae_moderate_content(text,text,boolean,text,text,boolean),public.korae_dismiss_reports(text,text,boolean,text,text,bigint),public.korae_admin_reports(text,text,boolean,bigint) to service_role;
