begin;
create table public.korae_chat_reads (
 uid text not null, friend_id text not null, read_at bigint not null default 0,
 primary key(uid,friend_id), check(uid<>friend_id), check(read_at>=0)
);
alter table public.korae_chat_reads enable row level security;
revoke all on public.korae_chat_reads from anon,authenticated;
create function public.korae_chat_read(p_uid text,p_friend text,p_message text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare conversation text; position bigint; target bigint; first_message jsonb;
begin
 if p_uid is null or p_uid=p_friend
  or not exists(select 1 from korae_documents where kind='following' and parent=p_uid and id=p_friend)
  or not exists(select 1 from korae_documents where kind='following' and parent=p_friend and id=p_uid)
 then raise exception '서로 팔로우한 친구와만 채팅할 수 있습니다.'; end if;
 conversation:=case when p_uid COLLATE "C"<p_friend COLLATE "C" then jsonb_build_array(p_uid,p_friend)::text else jsonb_build_array(p_friend,p_uid)::text end;
 -- JSON.stringify used by the message API has no spaces.
 conversation:=replace(conversation,', ', ',');
 if p_message is not null then
  select (body->>'createdAt')::bigint into target from korae_documents where kind='messages' and parent=conversation and id=p_message and body->>'senderId'=p_friend and body->>'recipientId'=p_uid;
  if target is null then raise exception '읽을 수 없는 메시지입니다.'; end if;
  insert into korae_chat_reads values(p_uid,p_friend,target) on conflict(uid,friend_id) do update set read_at=greatest(korae_chat_reads.read_at,excluded.read_at);
 end if;
 select coalesce((select read_at from korae_chat_reads where uid=p_uid and friend_id=p_friend),0) into position;
 select body||jsonb_build_object('id',id) into first_message from korae_documents
  where kind='messages' and parent=conversation and body->>'senderId'=p_friend and body->>'recipientId'=p_uid and (body->>'createdAt')::bigint>position
  order by (body->>'createdAt')::bigint,id limit 1;
 return jsonb_build_object('readAt',position,'firstUnread',first_message);
end $$;
revoke all on function public.korae_chat_read(text,text,text) from public,anon,authenticated;
grant execute on function public.korae_chat_read(text,text,text) to service_role;
commit;
