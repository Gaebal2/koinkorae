-- Compare the original image before replacing it, preserving concurrent edits.
create or replace function public.korae_move_photo(p_kind text,p_id text,p_parent text,p_field text,p_expected text,p_url text)
returns boolean language plpgsql set search_path=public,pg_temp as $$
begin
  if p_kind not in ('profiles','pins','posts') or p_field not in ('image','additionalImage','profileImage')
    or p_expected not like 'data:image/%' or p_url !~ '^https://cxvznpfcmorysnwwmbna[.]supabase[.]co/storage/v1/object/public/community-media/[a-f0-9]{64}[.](jpeg|png|webp)$' then
    raise exception 'Invalid photo migration';
  end if;
  update public.korae_documents set body=jsonb_set(body,array[p_field],to_jsonb(p_url))
    where kind=p_kind and id=p_id and parent=p_parent and body->>p_field=p_expected;
  return found;
end $$;
revoke all on function public.korae_move_photo(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.korae_move_photo(text,text,text,text,text,text) to service_role;
