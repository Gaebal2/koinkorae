-- Preserve the existing pin in its matching profile tab.
update public.korae_documents profile set body=(profile.body-'pinnedPostId')||jsonb_build_object('pinnedRepostId',post.id)
from public.korae_documents post
where profile.kind='profiles' and post.kind='posts' and post.parent='' and post.owner=profile.id
  and post.id=profile.body->>'pinnedPostId' and post.body->>'originalPostId' is not null;

create or replace function public.korae_mutate(p_action text,p_uid text,p_id text default '',p_value jsonb default '{}')
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare slot text;
begin
  if p_uid is null or p_uid='' then raise exception '로그인이 필요합니다.'; end if;
  if p_action='pinProfilePost' then
    if jsonb_typeof(p_value->'enabled') is distinct from 'boolean' then raise exception '잘못된 요청입니다.'; end if;
    -- Lock the post so deletion and pinning cannot leave a stale reference.
    select case when body->>'originalPostId' is null then 'pinnedPostId' else 'pinnedRepostId' end into slot from korae_documents where kind='posts' and parent='' and id=p_id and owner=p_uid for update;
    if not found then raise exception '내 피드만 고정할 수 있습니다.'; end if;
    if (p_value->>'enabled')::boolean then
      update korae_documents set body=body||jsonb_build_object(slot,p_id)
        where kind='profiles' and parent='' and id=p_uid;
      if not found then raise exception '프로필을 찾을 수 없습니다.'; end if;
    else
      update korae_documents set body=body-slot
        where kind='profiles' and parent='' and id=p_uid and body->>slot=p_id;
    end if;
    return null;
  elsif p_action='updateProfile' then
    insert into korae_documents(kind,id,parent,owner,body) values('profiles',p_uid,'',p_uid,p_value-'pinnedPostId'-'pinnedRepostId')
    on conflict(kind,parent,id) do update set body=korae_documents.body||(excluded.body-'pinnedPostId'-'pinnedRepostId');
    return null;
  end if;
  return public.korae_mutate_before_profile_pin(p_action,p_uid,p_id,p_value);
end $$;
revoke all on function public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_profile_pin(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_profile_pin(text,text,text,jsonb) to service_role;

create or replace function public.korae_clear_deleted_profile_pin()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  update korae_documents set body=body-'pinnedPostId'
    where kind='profiles' and parent='' and id=old.owner and body->>'pinnedPostId'=old.id;
  update korae_documents set body=body-'pinnedRepostId'
    where kind='profiles' and parent='' and id=old.owner and body->>'pinnedRepostId'=old.id;
  return old;
end $$;
drop trigger if exists korae_clear_deleted_profile_pin on public.korae_documents;
create trigger korae_clear_deleted_profile_pin after delete on public.korae_documents
for each row when (old.kind='posts') execute function public.korae_clear_deleted_profile_pin();

create or replace function public.korae_page(p_uid text,p_options jsonb default '{}',p_cursor jsonb default null,p_limit integer default 20)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare value jsonb;
begin
  if p_options->>'mode' is distinct from 'profilePin' then
    return public.korae_page_before_profile_pin(p_uid,p_options,p_cursor,p_limit);
  end if;
  select p.body||jsonb_build_object('id',p.id,'author',coalesce(a.body->>'username',p.body->>'author'),
    'authorProfile',a.body||jsonb_build_object('id',a.id),'repostProfile',rp.body||jsonb_build_object('id',rp.id),
    'commentCount',(select count(*) from korae_documents c where c.kind='comments' and c.parent=p.id),
    'likeCount',coalesce((p.body->>'likeCount')::bigint,0),
    'liked',exists(select 1 from korae_documents l where l.kind='likes' and l.parent=p.id and l.id=p_uid),
    'repostCount',(select count(*) from korae_documents r where r.kind='reposts' and r.parent=coalesce(p.body->>'originalPostId',p.id)),
    'reposted',exists(select 1 from korae_documents r where r.kind='reposts' and r.parent=coalesce(p.body->>'originalPostId',p.id) and r.id=p_uid)) into value
  from korae_documents profile
  join korae_documents p on p.kind='posts' and p.parent='' and p.id=profile.body->>(case when p_options->>'feed'='reposts' then 'pinnedRepostId' else 'pinnedPostId' end) and p.owner=profile.id
    and ((p_options->>'feed'='reposts' and p.body->>'originalPostId' is not null) or (coalesce(p_options->>'feed','posts')='posts' and p.body->>'originalPostId' is null))
  left join korae_documents a on a.kind='profiles' and a.parent='' and a.id=p.body->>'authorId'
  left join korae_documents rp on rp.kind='profiles' and rp.parent='' and rp.id=p.body->>'repostAuthorId'
  where profile.kind='profiles' and profile.parent='' and profile.id=p_options->>'profileId';
  return jsonb_build_object('items',case when value is null then '[]'::jsonb else jsonb_build_array(value) end,'nextCursor',null);
end $$;
revoke all on function public.korae_page(text,jsonb,jsonb,integer),public.korae_page_before_profile_pin(text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.korae_page(text,jsonb,jsonb,integer),public.korae_page_before_profile_pin(text,jsonb,jsonb,integer) to service_role;
