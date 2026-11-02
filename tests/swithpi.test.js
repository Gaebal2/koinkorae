import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {SNAPSHOT_AT,units,decimal,validPslAddress,matchesPayment,allocateSnapshot} from '../supabase/functions/_shared/swithpi.js';
const pi='G'+'A'.repeat(55),other='G'+'B'.repeat(55),hash='a'.repeat(64);
const sha=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
const psl=async()=>{const body='a'.repeat(40);return body+(await sha(await sha(body))).slice(0,4);};
test('Pi proof binds sender, exact amount, destination, time and successful native payment',()=>{
 const c={wallet_address:pi,muxed_address:'M-target',amount:'3.1400000',created_at:'2026-11-02T00:00:00Z',expires_at:'2026-11-02T00:10:00Z'};
 const p={type:'payment',transaction_successful:true,asset_type:'native',from:pi,to:pi,to_muxed_id:'18446744073709551615',amount:'3.14',created_at:'2026-11-02T00:05:00Z'};
 assert.ok(matchesPayment(p,c,p.to_muxed_id));
 for(const change of [{from:other},{amount:'3.1400001'},{transaction_successful:false},{asset_type:'credit_alphanum4'},{to_muxed_id:18446744073709551615},{created_at:'2026-11-02T00:11:00Z'},{to:other}])assert.equal(matchesPayment({...p,...change},c,p.to_muxed_id),false);
 assert.equal(matchesPayment({...p,to:'M-target'},c,p.to_muxed_id),true);
});
test('SASEUL validation preserves case and verifies PSL checksum',async()=>{
 assert.ok(await validPslAddress(await psl()));assert.equal(await validPslAddress('0'.repeat(44)),false);assert.equal(await validPslAddress((await psl()).toUpperCase()),false);
});
test('snapshot includes lockups, allocates by server sequence and caps final applicant precisely',()=>{
 const snapshot={network:'mainnet',snapshotAt:SNAPSHOT_AT,ledger:100,ledgerHash:hash,closedAt:SNAPSHOT_AT,nextClosedAt:'2026-12-24T15:00:05Z',accounts:[{address:pi,balance:'99999998.9999999',lockups:[{id:'lock1',asset:'native',amount:'1',claimants:[pi]}]},{address:other,balance:'10',lockups:[]}]};
 const entries=[{sequence:'2',pi_address:other,applied_at:'2026-11-03T00:00:00Z'},{sequence:'1',pi_address:pi,applied_at:'2026-11-02T00:00:00Z'}];
 const rows=allocateSnapshot(entries,snapshot);assert.equal(rows[0].amount,'99999999.9999999');assert.equal(rows[1].amount,'0.0000001');
 assert.equal(decimal(units('3.14')),'3.1400000');assert.throws(()=>units('1.00000001'));
 assert.throws(()=>allocateSnapshot(entries,{...snapshot,closedAt:'2026-12-25T00:00:00Z'}));
 assert.throws(()=>allocateSnapshot(entries,{...snapshot,accounts:snapshot.accounts.slice(0,1)}));
 const duplicate=structuredClone(snapshot);duplicate.accounts[1].lockups=duplicate.accounts[0].lockups;assert.throws(()=>allocateSnapshot(entries,duplicate));
 const ambiguous=structuredClone(snapshot);ambiguous.accounts[0].lockups[0].claimants.push(other);assert.throws(()=>allocateSnapshot(entries,ambiguous));
 assert.throws(()=>allocateSnapshot([...entries,{...entries[0],sequence:'3'}],snapshot));
});
async function database() {
 const pg=new PGlite();await pg.exec('create role anon; create role authenticated; create role service_role;');
 await pg.exec(await readFile(new URL('../supabase/migrations/202611020001_swithpi.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../supabase/migrations/202611020002_pi_testnet.sql',import.meta.url),'utf8'));
 await pg.exec("update korae_airdrop_events set opens_at=now()-interval '1 day',closes_at=now()+interval '1 day',snapshot_at=now()+interval '2 days'");
 return pg;
}
const rpc=async(pg,action,uid,value={})=>(await pg.query('select korae_swithpi($1,$2,$3::jsonb) result',[action,uid,JSON.stringify(value)])).rows[0].result;
test('private proofs, idempotent admission, immutable application wallets and deadline enforcement',async()=>{
 const pg=await database();try{
  await assert.rejects(rpc(pg,'apply','alice',{eventId:'psl-2026'}),/인증/);
  const c=await rpc(pg,'challenge','alice',{id:'00000000-0000-4000-8000-000000000001',session:'1',walletAddress:pi,muxedAddress:'M-one'});
  await assert.rejects(rpc(pg,'challengeRead','bob',{id:c.id,session:'1'}),/다시/);
  await assert.rejects(rpc(pg,'complete','alice',{id:c.id,session:'2',hash,email:'a@example.test'}),/다시/);
  assert.equal(c.network,'testnet');
  await rpc(pg,'complete','alice',{id:c.id,session:'1',hash,email:'a@example.test'});
  assert.equal((await rpc(pg,'status','alice')).identity.network,'testnet');
  assert.equal((await rpc(pg,'status','bob')).identity,null);
  await assert.rejects(rpc(pg,'savePsl','alice',{address:'0'.repeat(44)}),/체크섬/);
  await rpc(pg,'savePsl','alice',{address:await psl()});
  const a=await rpc(pg,'apply','alice',{eventId:'psl-2026',termsVersion:'2026-11-02'});
  const b=await rpc(pg,'apply','alice',{eventId:'psl-2026',termsVersion:'2026-11-02'});assert.equal(a.sequence,b.sequence);
  assert.equal(a.pi_address,pi);assert.equal(a.psl_address,await psl());
  assert.equal((await rpc(pg,'events',null)).entries.length,0);
  await assert.rejects(rpc(pg,'challenge','bob',{id:'00000000-0000-4000-8000-000000000002',session:'2',walletAddress:pi,muxedAddress:'M-two'}),/다른 계정/);
  await pg.exec("update korae_airdrop_events set closes_at=now()-interval '1 day';");
  await assert.rejects(rpc(pg,'apply','bob',{eventId:'psl-2026',termsVersion:'2026-11-02'}),/기간/);
  await pg.exec('set role anon');await assert.rejects(pg.query("select korae_swithpi('status','alice','{}')"),/permission denied/);
  await assert.rejects(pg.query('select * from korae_pi_wallets'),/permission denied/);
 }finally{await pg.close();}
});
test('expired proof cannot complete and snapshot cannot finalize before scheduled time',async()=>{
 const pg=await database();try{
  const c=await rpc(pg,'challenge','alice',{id:'00000000-0000-4000-8000-000000000001',session:'1',walletAddress:pi,muxedAddress:'M-one'});
  await pg.exec("update korae_pi_challenges set expires_at=now()-interval '1 second'");
  await assert.rejects(rpc(pg,'complete','alice',{id:c.id,session:'1',hash,email:'a@example.test'}),/만료/);
  await assert.rejects(pg.query("select korae_finalize_psl_snapshot('{}')"),/not due/);
 }finally{await pg.close();}
});
test('SQL finalization requires a complete snapshot and recomputes the capped allocation atomically',async()=>{
 const pg=await database();try{
  const at='2020-12-24T15:00:00Z';
  await pg.query('update korae_airdrop_events set snapshot_at=$1,closes_at=$1',[at]);
  for(const [uid,address] of [['alice',pi],['bob',other]])await pg.query("insert into korae_airdrop_entries(event_id,uid,pi_address,psl_address,verified_at,applied_at) values('psl-2026',$1,$2,$3,'2020-12-01','2020-12-01')",[uid,address,await psl()]);
  const snapshot={network:'mainnet',snapshotAt:at,ledger:100,ledgerHash:hash,closedAt:at,nextClosedAt:'2020-12-24T15:00:05Z',allocations:[{sequence:'1',pi_address:pi,balance:'99999999.9999999'},{sequence:'2',pi_address:other,balance:'10'}]};
  const finalize=s=>pg.query('select korae_finalize_psl_snapshot($1::jsonb) result',[JSON.stringify(s)]);
  await assert.rejects(finalize({...snapshot,allocations:snapshot.allocations.slice(0,1)}),/Incomplete/);
  await assert.rejects(finalize({...snapshot,allocations:[snapshot.allocations[0],snapshot.allocations[0]]}),/Invalid/);
  await assert.rejects(finalize({...snapshot,nextClosedAt:at}),/Invalid/);
  const result=(await finalize(snapshot)).rows[0].result;assert.equal(result.allocated,'100000000.0000000');
  const rows=(await pg.query('select allocation::text from korae_airdrop_entries order by sequence')).rows;
  assert.equal(rows[1].allocation,'0.0000001');
  await assert.rejects(finalize(snapshot),/already finalized/);
 }finally{await pg.close();}
});

test('testnet migration preserves completed mainnet proof and expires pending mainnet requests',async()=>{
 const pg=new PGlite();try{
 await pg.exec('create role anon; create role authenticated; create role service_role;');
 await pg.exec(await readFile(new URL('../supabase/migrations/202611020001_swithpi.sql',import.meta.url),'utf8'));
 const c=await rpc(pg,'challenge','alice',{id:'00000000-0000-4000-8000-000000000001',session:'1',walletAddress:pi,muxedAddress:'M-one'});
 await rpc(pg,'complete','alice',{id:c.id,session:'1',hash,email:'a@example.test'});
 await rpc(pg,'challenge','bob',{id:'00000000-0000-4000-8000-000000000002',session:'2',walletAddress:other,muxedAddress:'M-two'});
 await pg.exec(await readFile(new URL('../supabase/migrations/202611020002_pi_testnet.sql',import.meta.url),'utf8'));
 assert.equal((await rpc(pg,'status','alice')).identity.network,'mainnet');
 assert.equal((await pg.query("select status from korae_pi_challenges where uid='bob'")).rows[0].status,'expired');
 }finally{await pg.close();}
});

test('PSL import binds Google subject and rejects stale or mismatched ownership',async()=>{
 const {sameGoogleAccount,verifiedPslProof,loadPslProof}=await import('../supabase/functions/_shared/psl-import.js');
 const user={id:'00000000-0000-4000-8000-000000000001',email:'a@example.test',email_confirmed_at:'2026-01-01',identities:[{provider:'google',identity_data:{sub:'google-a'}}]};
 assert.ok(sameGoogleAccount(user,'google-a'));assert.equal(sameGoogleAccount(user,'google-b'),false);
 assert.equal(sameGoogleAccount({...user,identities:[{provider:'email',identity_data:{sub:'google-a'}}]},'google-a'),false);
 const identity={user_id:user.id,wallet_address:pi,network:'testnet',verification_tx_hash:hash,verified_at:'2026-01-01'};
 const challenge={user_id:user.id,wallet_address:pi,network:'testnet',transaction_hash:hash,status:'verified'};
 assert.equal(verifiedPslProof(user,identity,challenge).walletAddress,pi);
 for(const altered of [{...identity,user_id:'someone'},{...identity,network:'mainnet'},{...identity,verification_tx_hash:'invalid'}])assert.throws(()=>verifiedPslProof(user,altered,challenge));
 assert.throws(()=>verifiedPslProof(user,identity,{...challenge,transaction_hash:'b'.repeat(64)}));
 const calls=[];const proof=await loadPslProof({subject:'google-a',key:'test-key',fetcher:async(url,options)=>{
 calls.push([url,options]);return {ok:true,json:async()=>url.includes('/admin/users?')?{users:[{...user,identities:null,user_metadata:{sub:'google-a'}}]}:url.includes('/admin/users/')?user:url.includes('/pi_wallet_identities')?[identity]:[challenge]};
 }});
 await assert.rejects(loadPslProof({subject:'google-a',email:user.email,key:'test-key',fetcher:async url=>({ok:true,json:async()=>url.includes('/admin/users?')?{users:[{...user,identities:null,user_metadata:{sub:'google-a'}}]}:{...user,identities:[{provider:'google',identity_data:{sub:'someone-else'}}]}})}),/같은 Google/);
 assert.equal(proof.sourceUserId,user.id);assert.equal(calls.length,4);assert.ok(calls.every(([url,opts])=>url.startsWith('https://xvqbsiqeoxbkxsvxgnvc.supabase.co/')&&!opts.method));
});
test('PSL import preserves provenance, is idempotent, private, throttled and prevents duplicate wallets',async()=>{
 const pg=await database();try{
 await pg.exec(await readFile(new URL('../supabase/migrations/202611020005_psl_identity_import.sql',import.meta.url),'utf8'));
 const run=async(uid,value=null)=>(await pg.query('select korae_import_pi($1,$2) result',[uid,value&&JSON.stringify(value)])).rows[0].result;
 const proof={sourceUserId:'00000000-0000-4000-8000-000000000001',walletAddress:pi,hash,verifiedAt:'2026-01-01',email:'a@example.test',network:'testnet'};
 assert.equal(await run('alice'),null);await assert.rejects(run('alice'),/30초/);
 await assert.rejects(run('alice',{...proof,network:'mainnet'}),/유효/);
 const result=await run('alice',proof);assert.equal(result.source,'psl_mining');assert.equal(result.network,'testnet');assert.ok(result.imported_at);
 assert.equal((await run('alice',{...proof,walletAddress:other})).wallet_address,pi);
 await assert.rejects(run('bob',proof),/unique/);
 await pg.exec('set role anon');await assert.rejects(run('alice',proof),/permission denied/);
 }finally{await pg.close();}
});
