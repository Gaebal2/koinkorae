begin;
alter table public.korae_pi_wallets add column source text not null default 'koinkorae' check(source in ('koinkorae','psl_mining'));
alter table public.korae_pi_wallets add column source_user_id uuid unique;
alter table public.korae_pi_wallets add column imported_at timestamptz;
create table public.korae_pi_import_requests(uid text primary key,requested_at timestamptz not null);
alter table public.korae_pi_import_requests enable row level security;
revoke all on public.korae_pi_import_requests from public,anon,authenticated;
create function public.korae_import_pi(p_uid text,p_value jsonb default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing korae_pi_wallets; last_request timestamptz;
begin
 if p_uid is null or p_uid='' then raise exception '로그인이 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('swithpi-user:'||p_uid,0));
 select * into existing from korae_pi_wallets where uid=p_uid;
 if existing.uid is not null then return to_jsonb(existing); end if;
 if p_value is null then
  select requested_at into last_request from korae_pi_import_requests where uid=p_uid;
  if last_request>now()-interval '30 seconds' then raise exception '30초 후 다시 시도해 주세요.'; end if;
  insert into korae_pi_import_requests values(p_uid,now()) on conflict(uid) do update set requested_at=excluded.requested_at;
  return null;
 end if;
 if p_value->>'network' is distinct from 'testnet' or coalesce(p_value->>'email','')='' or
  coalesce(p_value->>'hash','')!~'^[a-fA-F0-9]{64}$' or
  coalesce(p_value->>'walletAddress','')!~'^G[A-Z2-7]{55}$' or
  coalesce(p_value->>'sourceUserId','')='' or
  p_value->>'verifiedAt' is null or (p_value->>'verifiedAt')::timestamptz>now()
 then raise exception '유효하지 않은 PSL 인증정보입니다.'; end if;
 insert into korae_pi_wallets(uid,wallet_address,network,verified_at,verified_email,verification_tx,source,source_user_id,imported_at)
 values(p_uid,p_value->>'walletAddress','testnet',(p_value->>'verifiedAt')::timestamptz,p_value->>'email',p_value->>'hash','psl_mining',(p_value->>'sourceUserId')::uuid,now()) returning * into existing;
 update korae_pi_challenges set status='expired' where uid=p_uid and status='pending';
 return to_jsonb(existing);
end $$;
revoke all on function public.korae_import_pi(text,jsonb) from public,anon,authenticated;
grant execute on function public.korae_import_pi(text,jsonb) to service_role;
commit;
