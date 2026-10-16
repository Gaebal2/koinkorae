-- Reports are private; identity/verified email are supplied only by the verified Edge API.
create table public.korae_report_targets (
 id bigint generated always as identity primary key, kind text not null check(kind in ('posts','pins')),
 target text not null, created_at timestamptz not null default now(), unique(kind,target)
);
create table public.korae_reports (
 target_id bigint not null references public.korae_report_targets on delete cascade,
 reporter text not null, created_at timestamptz not null default now(), primary key(target_id,reporter)
);
create table public.korae_content_moderation (
 kind text not null check(kind in ('posts','pins')), target text not null, hidden boolean not null default false,
 updated_by text not null, updated_at timestamptz not null default now(), primary key(kind,target)
);
alter table public.korae_report_targets enable row level security;
alter table public.korae_reports enable row level security;
alter table public.korae_content_moderation enable row level security;
revoke all on public.korae_report_targets,public.korae_reports,public.korae_content_moderation from public,anon,authenticated;
grant all on public.korae_report_targets,public.korae_reports,public.korae_content_moderation to service_role;
grant usage,select on sequence public.korae_report_targets_id_seq to service_role;

create function public.korae_content_visible(p_kind text,p_id text) returns boolean
language sql stable set search_path=public,pg_temp as $$
 select not exists(select 1 from korae_content_moderation where kind=p_kind and target=p_id and hidden)
 and (p_kind<>'posts' or not exists(
  select 1 from korae_documents d join korae_content_moderation m on m.kind='posts' and m.target=d.body->>'originalPostId' and m.hidden
  where d.kind='posts' and d.parent='' and d.id=p_id
 ));
$$;
create view public.korae_visible_documents as
 select d.* from public.korae_documents d where
 case when d.kind in ('posts','pins') then public.korae_content_visible(d.kind,d.id)
 when d.kind='reposts' then public.korae_content_visible('posts',d.parent) and public.korae_content_visible('posts',coalesce(d.body->>'feedId','repost_'||md5(d.parent||':'||d.id)))
 when d.kind in ('comments','likes') then public.korae_content_visible('posts',d.parent)
 else true end;
revoke all on public.korae_visible_documents from public,anon,authenticated;
grant select on public.korae_visible_documents to service_role;
revoke all on function public.korae_content_visible(text,text) from public,anon,authenticated;
grant execute on function public.korae_content_visible(text,text) to service_role;

-- Apply the visibility boundary before pagination, map counts and coin aggregation.
-- All historical read-only page layers are included; mutations keep the base table.
do $$ declare f record; definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'korae_page%' or p.proname in ('korae_battle_rankings','korae_comment_counts'))
 loop
  definition:=pg_get_functiondef(f.oid);
  execute replace(definition,'korae_documents','korae_visible_documents');
 end loop;
end $$;

create function public.korae_report_content(p_uid text,p_kind text,p_id text) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare report_id bigint; fresh boolean;
begin
 if p_uid is null or p_uid='' then raise exception '로그인이 필요합니다.';end if;
 if p_kind not in ('posts','pins') then raise exception '잘못된 신고 대상입니다.';end if;
 if not exists(select 1 from korae_visible_documents where kind=p_kind and id=p_id and parent='') then raise exception '삭제되었거나 가려진 항목입니다.';end if;
 insert into korae_report_targets(kind,target) values(p_kind,p_id) on conflict(kind,target) do nothing;
 select id into report_id from korae_report_targets where kind=p_kind and target=p_id;
 insert into korae_reports(target_id,reporter) values(report_id,p_uid) on conflict do nothing;
 fresh:=found;return jsonb_build_object('created',fresh);
end $$;
create function public.korae_admin_reports(p_uid text,p_email text,p_verified boolean,p_before bigint default null) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_uid is null or p_verified is distinct from true or lower(coalesce(p_email,''))<>'gaebal2017@gmail.com' then raise exception '관리자만 사용할 수 있습니다.';end if;
 with candidates as (
  select * from korae_report_targets where p_before is null or id<p_before order by id desc limit 21
 ), page as (select * from candidates order by id desc limit 20)
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
  'reportId',p.id,'kind',p.kind,'targetId',p.target,'createdAt',p.created_at,
  'count',(select count(*) from korae_reports r where r.target_id=p.id),
  'hidden',coalesce(m.hidden,false),'item',case when d.id is null then null else d.body||jsonb_build_object('id',d.id) end
 ) order by p.id desc),'[]'),'nextCursor',case when (select count(*) from candidates)>20 then (select min(id) from page) else null end)
 into result from page p left join korae_documents d on d.kind=p.kind and d.id=p.target and d.parent=''
 left join korae_content_moderation m on m.kind=p.kind and m.target=p.target;
 return result;
end $$;
create function public.korae_moderate_content(p_uid text,p_email text,p_verified boolean,p_kind text,p_id text,p_hidden boolean) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
begin
 if p_uid is null or p_verified is distinct from true or lower(coalesce(p_email,''))<>'gaebal2017@gmail.com' then raise exception '관리자만 사용할 수 있습니다.';end if;
 if p_hidden is null or p_kind not in ('posts','pins') then raise exception '잘못된 처리입니다.';end if;
 if not exists(select 1 from korae_report_targets where kind=p_kind and target=p_id) then raise exception '접수된 신고가 없습니다.';end if;
 perform 1 from korae_documents where kind=p_kind and parent='' and id=p_id for update;
 if not found then raise exception '이미 삭제된 항목입니다.';end if;
 insert into korae_content_moderation(kind,target,hidden,updated_by) values(p_kind,p_id,p_hidden,p_uid)
 on conflict(kind,target) do update set hidden=excluded.hidden,updated_by=excluded.updated_by,updated_at=now();
 -- Invalidate active clients without modifying user content or triggering rewards.
 perform realtime.send(jsonb_build_object('kind',p_kind,'id',p_id,'parent',''),'change','korae:public',true);
 return jsonb_build_object('hidden',p_hidden);
end $$;
revoke all on function public.korae_report_content(text,text,text),public.korae_admin_reports(text,text,boolean,bigint),public.korae_moderate_content(text,text,boolean,text,text,boolean) from public,anon,authenticated;
grant execute on function public.korae_report_content(text,text,text),public.korae_admin_reports(text,text,boolean,bigint),public.korae_moderate_content(text,text,boolean,text,text,boolean) to service_role;

-- Reject new engagement on hidden content, including direct API requests.
alter function public.korae_mutate(text,text,text,jsonb) rename to korae_mutate_before_moderation;
create function public.korae_mutate(p_action text,p_uid text,p_id text default '',p_value jsonb default '{}') returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare target_id text;
begin
 if p_action in ('comment','repost','startBattle') then target_id:=p_value->>'postId';
 elsif p_action in ('like','pinProfilePost') then target_id:=p_id;
 elsif p_action in ('applyBattle','finishBattle') then
  select body->>'postId' into target_id from korae_documents where kind='battleSessions' and id=p_uid and parent='';
 end if;
 if target_id is not null then
  perform 1 from korae_documents where kind='posts' and id=target_id and parent='' for update;
  if not korae_content_visible('posts',target_id) then raise exception '관리자가 가린 피드입니다.';end if;
 end if;
 return korae_mutate_before_moderation(p_action,p_uid,p_id,p_value);
end $$;
revoke all on function public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_moderation(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.korae_mutate(text,text,text,jsonb) to service_role;

alter table public.korae_notification_events drop constraint korae_notification_events_kind_check;
alter table public.korae_notification_events add constraint korae_notification_events_kind_check check(kind in ('comment','reply','repost','like','share','chat','checkin'));
do $$ begin
 execute replace(pg_get_functiondef('public.korae_notification_settings(text,text,jsonb)'::regprocedure),
 '''enabled'',''comment'',''repost''','''enabled'',''comment'',''reply'',''repost''');
end $$;
create or replace function public.korae_notification_activity() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare recipient text; actor text; target_id text; event_kind text; event_id text; reply_owner text; reply_enabled boolean:=false;
begin
 actor:=new.owner;
 if new.kind='comments' then
  event_kind:='comment';target_id:=new.parent;event_id:=new.parent||':'||new.id;
  -- Resolve the actual parent in this post, never trust a copied authorId.
  select owner into reply_owner from korae_documents where kind='comments' and parent=new.parent and id=new.body->'replyTo'->>'id';
  if reply_owner is not null and reply_owner<>actor then
   select value->>'enabled'='true' and value->>'reply'='true' into reply_enabled from korae_notification_preferences where uid=reply_owner;
   if korae_content_visible('posts',target_id) then perform korae_enqueue_notification('reply:'||event_id,reply_owner,'reply',target_id);end if;
  end if;
 elsif new.kind='likes' then event_kind:='like';target_id:=new.parent;actor:=new.id;event_id:=new.parent||':'||new.id||':'||floor(extract(epoch from now())/86400)::text;
 elsif new.kind='reposts' then event_kind:='repost';target_id:=new.parent;actor:=new.id;event_id:=new.parent||':'||new.id||':'||floor(extract(epoch from now())/86400)::text;
 elsif new.kind='messages' then event_kind:='chat';target_id:=new.body->>'senderId';actor:=target_id;recipient:=new.body->>'recipientId';event_id:=new.parent||':'||new.id;
 else return new;end if;
 if event_kind<>'chat' and not korae_content_visible('posts',target_id) then return new;end if;
 if recipient is null then select owner into recipient from korae_documents where kind='posts' and parent='' and id=target_id;end if;
 if recipient is not null and recipient<>actor and not coalesce(recipient=reply_owner and reply_enabled,false) then
  perform korae_enqueue_notification(event_kind||':'||event_id,recipient,event_kind,target_id);
 end if;
 return new;
end $$;
alter function public.korae_claim_push(integer) rename to korae_claim_push_before_moderation;
create function public.korae_claim_push(p_limit integer default 50) returns jsonb language plpgsql set search_path=public,pg_temp as $$
begin
 update korae_push_deliveries d set done=true from korae_notification_events e
 where d.event_key=e.event_key and not d.done and e.kind in ('comment','reply','repost','like','share') and not korae_content_visible('posts',e.target);
 return korae_claim_push_before_moderation(p_limit);
end $$;
revoke all on function public.korae_claim_push(integer),public.korae_claim_push_before_moderation(integer) from public,anon,authenticated;
grant execute on function public.korae_claim_push(integer) to service_role;
