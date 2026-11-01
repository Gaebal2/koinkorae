begin;
create table public.korae_pi_wallets (
 uid text primary key, wallet_address text unique not null check(wallet_address ~ '^G[A-Z2-7]{55}$'),
 network text not null default 'mainnet' check(network='mainnet'), verified_at timestamptz not null default now(),
 verified_email text not null, verification_tx text unique not null
);
create table public.korae_psl_wallets (uid text primary key, address text not null, updated_at timestamptz not null default now());
create table public.korae_pi_challenges (
 id uuid primary key, uid text not null, session_id text not null, wallet_address text not null,
 muxed_address text not null unique, amount numeric(20,7) not null default 3.14 check(amount=3.14),
 network text not null default 'mainnet' check(network='mainnet'),
 created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '10 minutes'),
 status text not null default 'pending' check(status in ('pending','verified','expired')), transaction_hash text unique
 ,last_checked_at timestamptz
);
create index on public.korae_pi_challenges(uid,created_at desc);
create table public.korae_airdrop_events (
 id text primary key, title text not null, description text not null, category text not null default 'token',
 organizer text not null, opens_at timestamptz not null default now(), closes_at timestamptz not null,
 snapshot_at timestamptz not null, cap numeric(20,7) not null, enabled boolean not null default true,
 payout_at timestamptz, completed_at timestamptz, snapshot_ledger bigint, snapshot_hash text
);
insert into public.korae_airdrop_events(id,title,description,organizer,closes_at,snapshot_at,cap) values
 ('psl-2026','PSL 에어드롭','Pi와 함께 시작하는 PSL. 메인넷 Pi 잔액과 락업된 Pi를 합산해 1 Pi당 1 PSL을 배정합니다.','PSL Mining','2026-12-24 15:00:00+00','2026-12-24 15:00:00+00',100000000);
create table public.korae_airdrop_entries (
 sequence bigint generated always as identity primary key, event_id text not null references public.korae_airdrop_events(id),
 uid text not null, pi_address text not null, psl_address text not null, verified_at timestamptz not null,
 applied_at timestamptz not null default clock_timestamp(), terms_version text not null default '2026-11-02',
 snapshot_balance numeric(20,7), allocation numeric(20,7), payout_tx text unique, paid_at timestamptz,
 unique(event_id,uid), unique(event_id,pi_address), check(allocation>=0), check(snapshot_balance>=0), check(allocation<=snapshot_balance)
);
alter table public.korae_pi_wallets enable row level security;
alter table public.korae_psl_wallets enable row level security;
alter table public.korae_pi_challenges enable row level security;
alter table public.korae_airdrop_events enable row level security;
alter table public.korae_airdrop_entries enable row level security;
revoke all on public.korae_pi_wallets,public.korae_psl_wallets,public.korae_pi_challenges,public.korae_airdrop_events,public.korae_airdrop_entries from anon,authenticated;
grant select on public.korae_airdrop_entries to service_role;

create function public.korae_swithpi(p_action text,p_uid text,p_value jsonb default '{}') returns jsonb
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
  if c.status='pending' and c.expires_at>now() and c.wallet_address=p_value->>'walletAddress' and c.session_id=p_value->>'session' then return to_jsonb(c); end if;
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
  if c.status<>'pending' or c.expires_at<=now() then raise exception '인증 시간이 만료되었습니다. 다시 요청해 주세요.'; end if;
  if coalesce(p_value->>'hash','') !~ '^[a-f0-9]{64}$' then raise exception '잘못된 인증 거래입니다.'; end if;
  if w.uid is not null then raise exception '이미 인증된 계정입니다.'; end if;
  insert into korae_pi_wallets(uid,wallet_address,verified_email,verification_tx) values(p_uid,c.wallet_address,p_value->>'email',p_value->>'hash') returning * into w;
  update korae_pi_challenges set status='verified',transaction_hash=p_value->>'hash' where id=c.id;
  return to_jsonb(w);
 elsif p_action='apply' then
  -- Serialize admission per event so sequence reflects server acceptance, including concurrent requests.
  select * into e from korae_airdrop_events where id=p_value->>'eventId' for update;
  if e.id is null then raise exception '이벤트를 찾을 수 없습니다.'; end if;
  select * into a from korae_airdrop_entries where event_id=e.id and uid=p_uid;
  if a.sequence is not null then return to_jsonb(a)||jsonb_build_object('sequence',a.sequence::text); end if;
  if not e.enabled or clock_timestamp()<e.opens_at or clock_timestamp()>=e.closes_at then raise exception '신청 기간이 아닙니다.'; end if;
  if w.uid is null then raise exception 'Pi 메인넷 지갑 소유권 인증이 필요합니다.'; end if;
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

create table public.korae_airdrop_snapshots (
 event_id text primary key references public.korae_airdrop_events(id), evidence jsonb not null,
 imported_at timestamptz not null default now()
);
alter table public.korae_airdrop_snapshots enable row level security;
revoke all on public.korae_airdrop_snapshots from anon,authenticated;
-- Operator-only: reviewed historical evidence. This records allocation, never sends tokens.
create function public.korae_finalize_psl_snapshot(p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare e korae_airdrop_events; count_entries integer; count_rows integer;
begin
 select * into e from korae_airdrop_events where id='psl-2026' for update;
 if clock_timestamp()<e.snapshot_at then raise exception 'Snapshot is not due'; end if;
 if e.snapshot_ledger is not null then raise exception 'Snapshot already finalized'; end if;
 if p_snapshot->>'network' is distinct from 'mainnet' or (p_snapshot->>'snapshotAt')::timestamptz is distinct from e.snapshot_at
  or coalesce((p_snapshot->>'ledger')::bigint,0)<1 or coalesce(p_snapshot->>'ledgerHash','') !~ '^[a-f0-9]{64}$'
  or not coalesce((p_snapshot->>'closedAt')::timestamptz<=e.snapshot_at,false)
  or not coalesce((p_snapshot->>'nextClosedAt')::timestamptz>e.snapshot_at,false)
  or jsonb_typeof(p_snapshot->'allocations') is distinct from 'array' then raise exception 'Invalid snapshot'; end if;
 select count(*) into count_entries from korae_airdrop_entries where event_id=e.id;
 select count(*) into count_rows from jsonb_array_elements(p_snapshot->'allocations');
 if count_entries<>count_rows then raise exception 'Incomplete snapshot'; end if;
 if exists(select 1 from jsonb_array_elements(p_snapshot->'allocations') r
   where coalesce(r->>'balance','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,7})?$'
   or not exists(select 1 from korae_airdrop_entries a where a.event_id=e.id and a.sequence::text=r->>'sequence' and a.pi_address=r->>'pi_address'))
   or (select count(distinct r->>'sequence') from jsonb_array_elements(p_snapshot->'allocations') r)<>count_rows then raise exception 'Invalid snapshot rows'; end if;
 insert into korae_airdrop_snapshots values(e.id,p_snapshot,now());
 with balances as (
  select a.sequence,(r->>'balance')::numeric balance from korae_airdrop_entries a
  join jsonb_array_elements(p_snapshot->'allocations') r on a.sequence::text=r->>'sequence' where a.event_id=e.id
 ), allocations as (
  select sequence,balance,least(balance,greatest(0,e.cap-coalesce(sum(balance) over(order by sequence rows between unbounded preceding and 1 preceding),0))) amount from balances
 ) update korae_airdrop_entries a set snapshot_balance=b.balance,allocation=b.amount from allocations b where a.sequence=b.sequence;
 update korae_airdrop_events set snapshot_ledger=(p_snapshot->>'ledger')::bigint,snapshot_hash=p_snapshot->>'ledgerHash',enabled=false where id=e.id;
 return jsonb_build_object('entries',count_entries,'allocated',(select coalesce(sum(allocation),0)::text from korae_airdrop_entries where event_id=e.id));
end $$;
revoke all on function public.korae_finalize_psl_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.korae_finalize_psl_snapshot(jsonb) to service_role;
commit;
