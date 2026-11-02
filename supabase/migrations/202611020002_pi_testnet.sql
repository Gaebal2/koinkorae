begin;
-- Preserve completed mainnet proofs. Only new proofs use Testnet.
alter table public.korae_pi_wallets drop constraint korae_pi_wallets_network_check;
alter table public.korae_pi_wallets add constraint korae_pi_wallets_network_check check(network in ('mainnet','testnet'));
alter table public.korae_pi_wallets alter column network set default 'testnet';
alter table public.korae_pi_challenges drop constraint korae_pi_challenges_network_check;
alter table public.korae_pi_challenges add constraint korae_pi_challenges_network_check check(network in ('mainnet','testnet'));
alter table public.korae_pi_challenges alter column network set default 'testnet';
update public.korae_pi_challenges set status='expired' where status='pending' and network='mainnet';
create or replace function public.korae_swithpi(p_action text,p_uid text,p_value jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w korae_pi_wallets; c korae_pi_challenges; e korae_airdrop_events; a korae_airdrop_entries; address text; result jsonb;
begin
 if p_action='events' then
  return jsonb_build_object('events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.opens_at desc),'[]') from korae_airdrop_events x),
   'entries',(select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('sequence',x.sequence::text,'allocation',x.allocation::text,'snapshot_balance',x.snapshot_balance::text)),'[]') from korae_airdrop_entries x where uid=p_uid));
 end if;
 if p_uid is null or p_uid='' then raise exception '로그인이 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('swithpi-user:'||p_uid,0));
 select * into w from korae_pi_wallets where uid=p_uid;
 if p_action='status' then
  return jsonb_build_object('identity',case when w.uid is null then null else to_jsonb(w) end,'pslAddress',coalesce((select x.address from korae_psl_wallets x where uid=p_uid),''));
 elsif p_action='savePsl' then
  if w.uid is null then raise exception 'Pi 지갑 소유권 인증이 필요합니다.'; end if;
  address:=p_value->>'address';
  if address is null or address !~ '^[a-fA-F0-9]{40}[a-f0-9]{4}$' or right(address,4)<>left(encode(sha256(convert_to(encode(sha256(convert_to(left(address,40),'UTF8')),'hex'),'UTF8')),'hex'),4) then raise exception 'SASEUL 지갑 주소의 형식과 체크섬을 확인해 주세요.'; end if;
  insert into korae_psl_wallets values(p_uid,address,now()) on conflict(uid) do update set address=excluded.address,updated_at=now();
  return jsonb_build_object('address',address);
 elsif p_action='challenge' then
  if w.uid is not null then return jsonb_build_object('alreadyVerified',true); end if;
  if exists(select 1 from korae_pi_wallets where wallet_address=p_value->>'walletAddress') then raise exception '이미 다른 계정에서 인증한 지갑입니다.'; end if;
  select * into c from korae_pi_challenges where uid=p_uid order by created_at desc limit 1;
  if c.status='pending' and c.network='testnet' and c.expires_at>now() and c.wallet_address=p_value->>'walletAddress' and c.session_id=p_value->>'session' then return to_jsonb(c); end if;
  if c.created_at>now()-interval '30 seconds' then raise exception '30초 후 다시 요청해 주세요.'; end if;
  update korae_pi_challenges set status='expired' where uid=p_uid and status='pending';
  insert into korae_pi_challenges(id,uid,session_id,wallet_address,muxed_address) values((p_value->>'id')::uuid,p_uid,p_value->>'session',p_value->>'walletAddress',p_value->>'muxedAddress') returning * into c;
  return to_jsonb(c);
 elsif p_action='challengeRead' then
  select * into c from korae_pi_challenges where id=(p_value->>'id')::uuid and uid=p_uid;
  if c.id is null or c.session_id<>p_value->>'session' then raise exception '인증 요청을 다시 시작해 주세요.'; end if;
  if c.last_checked_at>now()-interval '5 seconds' then raise exception '5초 후 다시 확인해 주세요.'; end if;
  update korae_pi_challenges set last_checked_at=now() where id=c.id;
  return to_jsonb(c);
 elsif p_action='complete' then
  select * into c from korae_pi_challenges where id=(p_value->>'id')::uuid and uid=p_uid for update;
  if c.id is null or c.session_id<>p_value->>'session' then raise exception '인증 요청을 다시 시작해 주세요.'; end if;
  if c.status='verified' and w.verification_tx=c.transaction_hash then return to_jsonb(w); end if;
  if c.network<>'testnet' or c.status<>'pending' or c.expires_at<=now() then raise exception '인증 시간이 만료되었습니다. 다시 요청해 주세요.'; end if;
  if coalesce(p_value->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception '잘못된 인증 거래입니다.'; end if;
  if w.uid is not null then raise exception '이미 인증된 계정입니다.'; end if;
  insert into korae_pi_wallets(uid,wallet_address,network,verified_email,verification_tx) values(p_uid,c.wallet_address,c.network,p_value->>'email',p_value->>'hash') returning * into w;
  update korae_pi_challenges set status='verified',transaction_hash=p_value->>'hash' where id=c.id;
  return to_jsonb(w);
 elsif p_action='apply' then
  -- Serialize admission per event so sequence reflects server acceptance, including concurrent requests.
  select * into e from korae_airdrop_events where id=p_value->>'eventId' for update;
  if e.id is null then raise exception '이벤트를 찾을 수 없습니다.'; end if;
  select * into a from korae_airdrop_entries where event_id=e.id and uid=p_uid;
  if a.sequence is not null then return to_jsonb(a)||jsonb_build_object('sequence',a.sequence::text); end if;
  if not e.enabled or clock_timestamp()<e.opens_at or clock_timestamp()>=e.closes_at then raise exception '신청 기간이 아닙니다.'; end if;
  if w.uid is null then raise exception 'Pi 지갑 소유권 인증이 필요합니다.'; end if;
  select x.address into address from korae_psl_wallets x where uid=p_uid;
  if address is null then raise exception 'PSL 수령 지갑 주소를 먼저 저장해 주세요.'; end if;
  if coalesce(p_value->>'termsVersion','')<>'2026-11-02' then raise exception '이벤트 참여 조건을 확인해 주세요.'; end if;
  insert into korae_airdrop_entries(event_id,uid,pi_address,psl_address,verified_at) values(e.id,p_uid,w.wallet_address,address,w.verified_at) returning * into a;
  return to_jsonb(a)||jsonb_build_object('sequence',a.sequence::text);
 end if;
 raise exception '지원하지 않는 요청입니다.';
end $$;
revoke all on function public.korae_swithpi(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.korae_swithpi(text,text,jsonb) to service_role;


commit;
