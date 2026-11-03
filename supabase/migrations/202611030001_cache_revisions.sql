-- Small, durable revision snapshots survive Edge restarts and missed broadcasts.
create table public.korae_cache_revisions (
 scope text not null, kind text not null, revision bigint not null default 1,
 primary key(scope,kind)
);
alter table public.korae_cache_revisions enable row level security;
revoke all on public.korae_cache_revisions from public,anon,authenticated;
create function public.korae_bump_cache_revision() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; recipient text; scopes text[];
begin
 if TG_OP='DELETE' then r:=old; else r:=new; end if;
 if TG_TABLE_NAME='korae_documents' then
  if TG_OP='UPDATE' and old.body=new.body then return new; end if;
  if r.kind in ('profiles','pins','posts','comments','following','reposts') then scopes:=array['public'];
  elsif r.kind='balances' then scopes:=array['user:'||r.id];
  elsif r.kind='messages' then select array_agg('user:'||value) into scopes from jsonb_array_elements_text(r.parent::jsonb);
  end if;
 else scopes:=array['public']; end if;
 foreach recipient in array coalesce(scopes,array[]::text[]) loop
  insert into korae_cache_revisions(scope,kind) values(recipient,r.kind)
  on conflict(scope,kind) do update set revision=korae_cache_revisions.revision+1;
 end loop;
 return coalesce(new,old);
end $$;
create trigger korae_cache_changed after insert or update or delete on public.korae_documents
 for each row execute function public.korae_bump_cache_revision();
create trigger korae_cache_moderated after insert or update or delete on public.korae_content_moderation
 for each row execute function public.korae_bump_cache_revision();
create function public.korae_cache_snapshot(p_uid text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_object_agg(scope||':'||kind,revision::text),'{}'::jsonb)
 from korae_cache_revisions where scope='public' or scope='user:'||p_uid;
$$;
revoke all on function public.korae_bump_cache_revision() from public,anon,authenticated;
revoke all on function public.korae_cache_snapshot(text) from public,anon,authenticated;
grant execute on function public.korae_cache_snapshot(text) to service_role;
