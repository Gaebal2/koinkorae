-- Publish only the earned rank; never expose balances or private activity stats.
create function public.korae_sync_profile_rank() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare earned integer;
begin
 earned:=public.korae_points_level(new.body);
 update public.korae_documents
 set body=body||jsonb_build_object('rankLevel',earned)
 where kind='profiles' and parent='' and id=new.id
   and (body->>'rankLevel')::integer is distinct from earned;
 return new;
end $$;
create trigger korae_sync_profile_rank after insert or update of body on public.korae_documents
for each row when (new.kind='balances') execute function public.korae_sync_profile_rank();
update public.korae_documents p
set body=p.body||jsonb_build_object('rankLevel',public.korae_points_level(b.body))
from public.korae_documents b
where p.kind='profiles' and p.parent='' and b.kind='balances' and b.parent='' and b.id=p.id;
revoke all on function public.korae_sync_profile_rank() from public,anon,authenticated;
grant execute on function public.korae_sync_profile_rank() to service_role;
