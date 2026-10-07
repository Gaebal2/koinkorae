create table if not exists public.korae_trial_settings (
 id integer primary key check(id=1), member_limit integer not null default 50 check(member_limit=50),
 member_count integer not null default 0 check(member_count between 0 and 50), maintenance boolean not null default false
);
insert into public.korae_trial_settings(id) values(1) on conflict do nothing;
create table if not exists public.korae_trial_members(uid text primary key, joined_at timestamptz not null default now());
alter table public.korae_trial_settings enable row level security;
alter table public.korae_trial_members enable row level security;
revoke all on public.korae_trial_settings,public.korae_trial_members from public,anon,authenticated;
grant all on public.korae_trial_settings,public.korae_trial_members to service_role;
insert into public.korae_trial_members(uid) select id from public.korae_documents where kind='profiles' and parent='' on conflict do nothing;
update public.korae_trial_settings set member_count=(select count(*) from public.korae_trial_members) where id=1;
create or replace function public.korae_trial_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare settings korae_trial_settings;
begin
 if current_setting('korae.reset',true)='on' then return case when tg_op='DELETE' then old else new end; end if;
 select * into settings from korae_trial_settings where id=1 for share;
 if settings.maintenance then raise exception 'Service maintenance. Please try again shortly.'; end if;
 if tg_op='INSERT' and new.kind='profiles' and not exists(select 1 from korae_trial_members where uid=new.id) then
   raise exception 'Service membership required.';
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists korae_trial_write_guard on public.korae_documents;
create trigger korae_trial_write_guard before insert or update or delete on public.korae_documents for each row execute function public.korae_trial_guard();
create or replace function public.korae_admit(p_uid text,p_name text) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare settings korae_trial_settings;
begin
 if p_uid is null or p_uid='' or length(p_uid)>128 then raise exception 'Invalid member.'; end if;
 -- The row lock serializes the final available seat across all Edge instances.
 select * into settings from korae_trial_settings where id=1 for update;
 if settings.maintenance then raise exception 'Service maintenance. Please try again shortly.'; end if;
 if not exists(select 1 from korae_trial_members where uid=p_uid) then
   if settings.member_count>=settings.member_limit then raise exception 'Trial capacity reached (50 members).'; end if;
   insert into korae_trial_members(uid) values(p_uid);
   update korae_trial_settings set member_count=member_count+1 where id=1;
 end if;
 if not exists(select 1 from korae_documents where kind='profiles' and parent='' and id=p_uid) then
   insert into korae_documents(kind,id,parent,owner,body) values('profiles',p_uid,'',p_uid,jsonb_build_object('username',left(coalesce(nullif(p_name,''),'Member'),24),'bio','','profileImage',''));
 end if;
 return jsonb_build_object('admitted',true);
end $$;
revoke all on function public.korae_admit(text,text), public.korae_trial_guard() from public,anon,authenticated;
grant execute on function public.korae_admit(text,text) to service_role;
