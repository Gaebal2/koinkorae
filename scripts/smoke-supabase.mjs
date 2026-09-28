import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
const {apiKey}=JSON.parse(await readFile('src/firebase-config.json','utf8'));
const url='https://cxvznpfcmorysnwwmbna.supabase.co/functions/v1/community';
let token,uid;
async function api(action,args={},authenticated=true){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(authenticated&&token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({action,args}),signal:AbortSignal.timeout(30000)});
  const value=await response.json();return {status:response.status,...value};
}
async function ok(action,args={}){const response=await api(action,args);assert.equal(response.status,200,`${action}: ${response.error}`);return response.data;}
try{
  assert.equal((await api('posts',{},false)).status,200);
  assert.equal((await api('checkin',{},false)).status,401);
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json',Referer:'https://gaebal2.github.io/koinkorae/'},body:JSON.stringify({email:`migration-${randomUUID()}@example.com`,password:randomBytes(24).toString('base64url'),returnSecureToken:true})});
  const account=await response.json();assert.equal(response.status,200,'Firebase test account creation failed: '+(account.error?.message || ''));
  token=account.idToken;uid=account.localId;
  assert.match(uid,/^[A-Za-z0-9_-]+$/);
  await writeFile('.runtime/supabase-migration/smoke-cleanup.sql',`delete from public.korae_documents where owner='${uid}'; select count(*) as test_rows_remaining from public.korae_documents where owner='${uid}';`);
  await ok('ensureProfile');await ok('saveProfile',{value:{bio:'Migration connectivity test',profileImage:''}});
  await ok('checkin');await ok('checkin');assert.equal((await ok('balance',{uid})).current,10);
  const p=await ok('savePin',{value:{title:'Migration test',description:'Temporary verification',coin:'PI',tradeCoins:[],image:'',link:'',category:'판매',lat:0,lng:0}});
  await ok('deletePin',{id:p.id});
  await ok('publish',{value:{content:'Temporary migration verification',coin:'PI',image:''}});
  const [post]=await ok('authorPosts',{uid});assert.ok(post?.id);
  await ok('comment',{postId:post.id,content:'Verification',side:'support'});
  assert.equal((await ok('comments',{postId:post.id})).length,1);
  await ok('repost',{postId:post.id,enabled:true});
  const requestId=randomUUID(), session=await ok('startBattle',{postId:post.id,side:'support',requestId});
  assert.equal(session.id,requestId);
  await new Promise(resolve=>setTimeout(resolve,6500));
  const result=await ok('finishBattle',{sessionId:session.id,inputs:[]});
  assert.deepEqual(await ok('finishBattle',{sessionId:session.id,inputs:[]}),result);
  assert.equal((await ok('postsById',{ids:[post.id]}))[0].support,result.score);
  await ok('deletePost',{id:post.id});
  token='invalid';assert.equal((await api('checkin')).status,401);token=account.idToken;
  console.log('Live API checks passed: public reads, token validation, profile, check-in exactly once, pin, post, comment, repost, verified battle and idempotent finish.');
}finally{
  if(token&&uid){const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json',Referer:'https://gaebal2.github.io/koinkorae/'},body:JSON.stringify({idToken:token})});if(!response.ok)throw Error('Test auth account cleanup failed');console.log('Temporary Firebase test account removed.');}
}

