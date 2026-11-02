export const SNAPSHOT_AT = '2026-12-24T15:00:00.000Z';
export const EVENT_ID = 'psl-2026';
export const CAP = 100000000n * 10000000n;
export const HORIZON = 'https://api.testnet.minepi.com';
export function units(value) {
  const m = /^(0|[1-9]\d{0,14})(?:\.(\d{1,7}))?$/.exec(String(value));
  if (!m) throw Error('Invalid amount');
  return BigInt(m[1])*10000000n + BigInt((m[2]||'').padEnd(7,'0'));
}
export function decimal(value) { return `${value/10000000n}.${String(value%10000000n).padStart(7,'0')}`; }
// Adapted from PSL Mining wallet-verify/payment.ts. Never use floating point for Pi.
export function matchesPayment(p,c,muxedId) {
  try {
    return p.type==='payment' && p.transaction_successful===true && p.asset_type==='native'
      && p.from===c.wallet_address
      && (p.to===c.muxed_address || p.to_muxed===c.muxed_address || (p.to===c.wallet_address && typeof p.to_muxed_id==='string' && p.to_muxed_id===muxedId))
      && units(p.amount)===units(c.amount)
      && Date.parse(p.created_at)>=Date.parse(c.created_at) && Date.parse(p.created_at)<=Date.parse(c.expires_at);
  } catch { return false; }
}
export async function validPslAddress(value) {
  if (!/^[a-fA-F0-9]{40}[a-f0-9]{4}$/.test(value)) return false;
  const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
  return (await hash(await hash(value.slice(0,40)))).slice(0,4)===value.slice(-4);
}
// Input must be an audited historical ledger export, never today's Horizon balances.
export function allocateSnapshot(entries, snapshot) {
  if(snapshot.network!=='mainnet' || snapshot.snapshotAt!==SNAPSHOT_AT || !Number.isSafeInteger(snapshot.ledger) || snapshot.ledger<1
    || !/^[a-f0-9]{64}$/.test(snapshot.ledgerHash||'') || !(Date.parse(snapshot.closedAt)<=Date.parse(SNAPSHOT_AT))
    || !(Date.parse(snapshot.nextClosedAt)>Date.parse(SNAPSHOT_AT))) throw Error('Invalid snapshot ledger boundary');
  const balances=new Map(), locks=new Set();
  for(const row of snapshot.accounts||[]) {
    if(balances.has(row.address)) throw Error('Duplicate account');
    let total=units(row.balance);
    for(const lock of row.lockups||[]) {
      // Multiple eligible claimants need explicit attribution review; never count for both.
      if(!lock.id || locks.has(lock.id) || lock.asset!=='native' || lock.claimants?.length!==1 || lock.claimants[0]!==row.address) throw Error('Ambiguous or duplicate lockup');
      locks.add(lock.id);total+=units(lock.amount);
    }
    balances.set(row.address,total);
  }
  let remaining=CAP;const wallets=new Set(),sequences=new Set();
  return [...entries].sort((a,b)=>BigInt(a.sequence)<BigInt(b.sequence)?-1:1).map(entry=>{
    if(!balances.has(entry.pi_address) || wallets.has(entry.pi_address) || sequences.has(String(entry.sequence))) throw Error('Missing or duplicate applicant');
    if(!(Date.parse(entry.applied_at)<Date.parse(SNAPSHOT_AT))) throw Error('Late application');
    wallets.add(entry.pi_address);sequences.add(String(entry.sequence));
    const balance=balances.get(entry.pi_address),amount=balance<remaining?balance:remaining;remaining-=amount;
    return {...entry,balance:decimal(balance),amount:decimal(amount)};
  });
}
