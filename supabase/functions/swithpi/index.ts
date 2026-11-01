import {createRemoteJWKSet,jwtVerify} from 'npm:jose@6';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {Account,Keypair,MuxedAccount} from 'npm:@stellar/stellar-sdk@14.1.1';
import {HORIZON,matchesPayment,validPslAddress} from '../_shared/swithpi.js';
const project=Deno.env.get('FIREBASE_PROJECT_ID')||'koinkorae-map';
const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const rpc=async(action:string,uid:string|null,value:unknown={})=>{
 const {data,error}=await client.rpc('korae_swithpi',{p_action:action,p_uid:uid,p_value:value});
 if(error)throw Error(error.code==='23505'?'이미 인증 또는 신청된 지갑입니다.':error.message);
 return data;
};
Deno.serve(async request=>{
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({error:'POST 요청이 필요합니다.'},405);
 try {
  const raw=await request.text();if(raw.length>4096)return reply({error:'요청이 너무 큽니다.'},413);
  const {action,value={}}=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('잘못된 요청입니다.');
  let identity:any=null;
  const bearer=request.headers.get('Authorization');
  if(bearer){
   try{
    if(!bearer.startsWith('Bearer '))throw Error('token');
    const {payload:p}=await jwtVerify(bearer.slice(7),jwks,{algorithms:['RS256'],issuer:`https://securetoken.google.com/${project}`,audience:project,requiredClaims:['exp','iat','sub','auth_time']});
    if(!p.sub||p.sub.length>128||typeof p.auth_time!=='number'||p.auth_time>Date.now()/1000||!p.iat||p.iat>Date.now()/1000)throw Error('claims');
    identity={uid:p.sub,name:typeof p.name==='string'?p.name:'회원',email:p.email,emailVerified:p.email_verified===true,provider:(p.firebase as any)?.sign_in_provider,session:String(p.auth_time)};
   }catch{return reply({error:'로그인이 만료되었습니다. 다시 로그인해 주세요.'},401);}
  }
  if(action==='events')return reply({data:await rpc('events',identity?.uid||null)});
  if(!identity)return reply({error:'로그인이 필요합니다.'},401);
  const uid=identity.uid;
  if(action==='status')return reply({data:await rpc('status',uid)});
  if(!['savePsl','apply','challenge','verify'].includes(action))throw Error('지원하지 않는 요청입니다.');
  const {error:admissionError}=await client.rpc('korae_admit',{p_uid:uid,p_name:identity.name});
  if(admissionError)throw Error('현재 계정으로 참여할 수 없습니다. 로그인 상태와 서비스 이용 가능 여부를 확인해 주세요.');
  if(action==='savePsl'){
   const address=String(value.address||'').trim();
   if(!await validPslAddress(address))throw Error('SASEUL 지갑 주소의 형식과 체크섬을 확인해 주세요.');
   return reply({data:await rpc('savePsl',uid,{address})});
  }
  if(action==='apply')return reply({data:await rpc('apply',uid,{eventId:value.eventId,termsVersion:value.termsVersion})});
  if(!identity.emailVerified||identity.provider!=='google.com')throw Error('지갑 인증은 Google 계정으로 로그인한 뒤 진행해 주세요.');
  if(action==='challenge'){
   const walletAddress=String(value.walletAddress||'').trim().toUpperCase();
   try{Keypair.fromPublicKey(walletAddress);}catch{throw Error('올바른 G로 시작하는 Pi 메인넷 주소를 입력해 주세요.');}
   const random=crypto.getRandomValues(new Uint32Array(2)),id=((BigInt(random[0])<<32n)|BigInt(random[1])).toString();
   const muxed=new MuxedAccount(new Account(walletAddress,'0'),id);
   return reply({data:await rpc('challenge',uid,{id:crypto.randomUUID(),session:identity.session,walletAddress,muxedAddress:muxed.accountId()})});
  }
  if(action==='verify'){
   if(!/^[a-f0-9-]{36}$/i.test(String(value.id||'')))throw Error('잘못된 인증 요청입니다.');
   const c=await rpc('challengeRead',uid,{id:value.id,session:identity.session});
   if(c.status==='verified')return reply({data:{verified:true,...await rpc('status',uid)}});
   if(c.network!=='mainnet'||c.status!=='pending'||Date.parse(c.expires_at)<=Date.now())throw Error('인증 시간이 만료되었습니다. 다시 요청해 주세요.');
   const muxedId=MuxedAccount.fromAddress(c.muxed_address,'0').id();
   let cursor='',payment=null;
   const signal=AbortSignal.timeout(18000);
   for(let page=0;page<5;page++){
    const response=await fetch(`${HORIZON}/accounts/${c.wallet_address}/payments?order=desc&limit=200${cursor?'&cursor='+encodeURIComponent(cursor):''}`,{signal});
    if(response.status===404)break;
    if(!response.ok)throw Error('Pi 메인넷 거래 조회에 실패했습니다. 잠시 후 다시 확인해 주세요.');
    const records=(await response.json())?._embedded?.records||[];
    payment=records.find((p:any)=>matchesPayment(p,c,muxedId));
    if(payment||records.length<200||Date.parse(records.at(-1)?.created_at)<Date.parse(c.created_at))break;
    cursor=records.at(-1).paging_token;
   }
   if(!payment)return reply({data:{verified:false}});
   const verified=await rpc('complete',uid,{id:c.id,session:identity.session,email:identity.email,hash:payment.transaction_hash});
   return reply({data:{verified:true,identity:verified}});
  }
  throw Error('지원하지 않는 요청입니다.');
 }catch(error){return reply({error:error instanceof Error?error.message:'요청을 처리하지 못했습니다.'},400);}
});
