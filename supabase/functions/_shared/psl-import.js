// Only the server calls PSL Mining; never trust an email or wallet supplied by the browser.
export function sameGoogleAccount(user,subject) {
 return typeof subject==='string'&&subject.length>0&&!!user?.email_confirmed_at&&
  user.identities?.some(i=>i.provider==='google'&&String(i.identity_data?.sub||i.id)===subject)===true;
}
export function verifiedPslProof(user,identity,challenge,now=Date.now()) {
 if(!identity||identity.user_id!==user.id||identity.network!=='testnet'||
  !/^G[A-Z2-7]{55}$/.test(identity.wallet_address)||! /^[a-f0-9]{64}$/i.test(identity.verification_tx_hash)||
  !Number.isFinite(Date.parse(identity.verified_at))||Date.parse(identity.verified_at)>now||
  !challenge||challenge.user_id!==user.id||challenge.network!=='testnet'||challenge.status!=='verified'||
  challenge.wallet_address!==identity.wallet_address||challenge.transaction_hash!==identity.verification_tx_hash)
  throw Error('PSL Mining에서 유효한 Pi 지갑 소유권 인증을 찾지 못했습니다.');
 return {sourceUserId:user.id,walletAddress:identity.wallet_address,hash:identity.verification_tx_hash,verifiedAt:identity.verified_at,email:user.email,network:'testnet'};
}
export async function loadPslProof({subject,email,key,fetcher=fetch}) {
 if(!key)throw Error('PSL 인증정보 가져오기 연결이 준비되지 않았습니다.');
 const base='https://xvqbsiqeoxbkxsvxgnvc.supabase.co';
 const signal=AbortSignal.timeout(18000);
 const get=async path=>{
  const response=await fetcher(base+path,{headers:{apikey:key,Authorization:'Bearer '+key},signal});
  if(!response.ok)throw Error('PSL Mining 인증정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return response.json();
 };
 let user;
 // Auth admin API is read-only. No PSL account, session, or profile is created or updated.
 for(let page=1;page<=20;page++){
  const result=await get('/auth/v1/admin/users?page='+page+'&per_page=1000');
  const users=result.users||[];
  // listUsers omits identities. Metadata/email are only search hints, never proof.
  for(const candidate of users.filter(u=>sameGoogleAccount(u,subject)||u.user_metadata?.sub===subject||(email&&u.email?.toLowerCase()===email.toLowerCase()))){
   const detail=await get('/auth/v1/admin/users/'+encodeURIComponent(candidate.id));
   const verified=detail.user||detail;
   if(sameGoogleAccount(verified,subject)){user=verified;break;}
  }
  if(user||users.length<1000)break;
 }
 if(!user)throw Error('PSL Mining에서 같은 Google 계정을 찾지 못했습니다. 두 앱에서 같은 Google 계정을 사용해 주세요.');
 const filter='user_id=eq.'+encodeURIComponent(user.id);
 const identities=await get('/rest/v1/pi_wallet_identities?select=user_id,wallet_address,network,verification_tx_hash,verified_at&'+filter);
 const identity=identities[0];
 if(!identity)throw Error('PSL Mining에서 유효한 Pi 지갑 소유권 인증을 찾지 못했습니다.');
 const challenges=await get('/rest/v1/wallet_verification_challenges?select=user_id,wallet_address,network,status,transaction_hash&'+filter+'&transaction_hash=eq.'+encodeURIComponent(identity.verification_tx_hash));
 return verifiedPslProof(user,identity,challenges[0]);
}
