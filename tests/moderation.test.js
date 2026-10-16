import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {communityHarness} from './community-harness.js';
import {dispatch} from '../supabase/functions/community/handler.js';
import {isAdministrator} from '../supabase/functions/community/moderation.js';
import {preferences,notificationPayload} from '../supabase/functions/community/notifications.js';
const admin={uid:'admin',name:'Admin',email:'gaebal2017@gmail.com',emailVerified:true};
const alice={uid:'alice',name:'Alice'},bob={uid:'bob',name:'Bob'},carol={uid:'carol',name:'Carol'};
async function setup(){
 const {pg,db}=await communityHarness({pointsPolicy:true});
 for(const migration of ['202610160001_notifications.sql','202610160002_reports_and_replies.sql'])await pg.exec(await readFile(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
 const rpc=async(sql,args=[])=>(await pg.query(sql,args)).rows[0]?.value;
 db.notifications=(uid,action,value={})=>rpc('select korae_notification_settings($1,$2,$3) as value',[uid,action,JSON.stringify(value)]);
 db.reportContent=(uid,kind,id)=>rpc('select korae_report_content($1,$2,$3) as value',[uid,kind,id]);
 db.adminReports=(identity,before)=>rpc('select korae_admin_reports($1,$2,$3,$4) as value',[identity.uid,identity.email,identity.emailVerified,before]);
 db.moderateContent=(identity,kind,id,hidden)=>rpc('select korae_moderate_content($1,$2,$3,$4,$5,$6) as value',[identity.uid,identity.email,identity.emailVerified,kind,id,hidden]);
 for(const identity of [alice,bob,carol,admin])await dispatch(db,identity,'ensureProfile');
 return {pg,db,rpc};
}
test('administrator requires a verified email from server identity, never request arguments',async()=>{
 assert.equal(isAdministrator(admin),true);
 for(const identity of [null,{...admin,emailVerified:false},{...admin,email:'other@gmail.com'},alice])assert.equal(isAdministrator(identity),false);
 for(const action of ['adminReports','moderateContent'])await assert.rejects(dispatch({},alice,action,{email:admin.email,emailVerified:true}),/관리자/);
 await assert.rejects(dispatch({},null,'reportContent',{kind:'posts',id:'one'}),/로그인/);
 assert.equal(preferences({enabled:true,reply:true}).reply,true);
 assert.match(notificationPayload({kind:'reply',target:'post',event_key:'reply'}).body,/답글/);
});
test('reports deduplicate, hidden content is excluded before paging and can be restored',async()=>{
 const {pg,db,rpc}=await setup();
 try{
  await dispatch(db,alice,'publish',{value:{content:'A public original for moderation',coin:'BTC'}});
  const post=(await db.list('posts'))[0];
  await dispatch(db,bob,'repost',{postId:post.id,enabled:true});
  const repost=(await db.list('posts')).find(row=>row.body.originalPostId);
  const pin=await dispatch(db,alice,'savePin',{value:{title:'Pin for moderation',description:'An example trade',coin:'BTC',tradeCoins:['ETH'],category:'P2P 판매',lat:37,lng:127,image:'',link:''}});
  const parent=await dispatch(db,bob,'comment',{postId:post.id,content:'Visible comment',side:'support'});
  assert.equal((await dispatch(db,bob,'reportContent',{kind:'posts',id:post.id})).created,true);
  assert.equal((await dispatch(db,bob,'reportContent',{kind:'posts',id:post.id})).created,false);
  await dispatch(db,carol,'reportContent',{kind:'posts',id:post.id});
  await dispatch(db,bob,'reportContent',{kind:'pins',id:pin.id});
  let list=await dispatch(db,admin,'adminReports');
  assert.equal(list.items.length,2);assert.equal(list.items.find(row=>row.kind==='posts').count,2);
  await assert.rejects(rpc('select korae_moderate_content($1,$2,$3,$4,$5,$6) as value',['bob',admin.email,false,'posts',post.id,true]),/관리자/);
  await dispatch(db,admin,'moderateContent',{kind:'posts',id:post.id,hidden:true});
  assert.equal((await db.page(null,{mode:'posts'},null,20)).items.length,0,'original and repost removed');
  assert.equal((await db.page(null,{mode:'coins'},null,20)).items.length,0,'coin aggregates filtered');
  assert.equal((await db.page('bob',{mode:'ownComments'},null,20)).items.length,0);
  assert.equal((await db.page(null,{mode:'comments',postId:post.id},null,20)).items.length,0);
  assert.equal((await pg.query("select count(*)::int n from korae_visible_documents where kind='posts'")).rows[0].n,0);
  assert.equal((await pg.query("select count(*)::int n from korae_documents where kind='posts'")).rows[0].n,2,'originals preserved');
  await assert.rejects(dispatch(db,bob,'like',{postId:post.id,enabled:true}),/가린/);
  await assert.rejects(dispatch(db,bob,'comment',{postId:post.id,content:'Blocked',side:'support'}),/가린/);
  await assert.rejects(dispatch(db,bob,'repost',{postId:post.id,enabled:true}),/가린/);
  await dispatch(db,admin,'moderateContent',{kind:'pins',id:pin.id,hidden:true});
  const map=await db.page(null,{mode:'pins'},null,20);assert.equal(map.items.length,0);assert.equal(map.totalCount,0);
  list=await dispatch(db,admin,'adminReports');assert.ok(list.items.every(row=>row.hidden&&row.item));
  await dispatch(db,admin,'moderateContent',{kind:'posts',id:post.id,hidden:false});
  await dispatch(db,admin,'moderateContent',{kind:'pins',id:pin.id,hidden:false});
  assert.equal((await db.page(null,{mode:'posts'},null,20)).items.length,2);
  assert.equal((await db.page(null,{mode:'pins'},null,20)).items.length,1);
  assert.equal((await pg.query("select count(*)::int n from realtime.test_events where payload->>'kind'='pins'")).rows[0].n>=2,true);
  // Direct read API uses the same visibility view.
  await dispatch(db,admin,'moderateContent',{kind:'pins',id:pin.id,hidden:true});
  db.one=async(kind,id,parent='')=>(await pg.query('select * from korae_visible_documents where kind=$1 and id=$2 and parent=$3',[kind,id,parent])).rows[0]||null;
  assert.equal(await dispatch(db,null,'getPin',{id:pin.id}),null);
  await pg.exec('set role anon');
  for(const table of ['korae_reports','korae_report_targets','korae_content_moderation','korae_visible_documents'])await assert.rejects(pg.query('select * from '+table),/permission denied/);
  await pg.exec('reset role');
 }finally{await pg.close();}
});
test('reply notifications resolve parent author, respect settings and avoid duplicate owner alerts',async()=>{
 const {pg,db,rpc}=await setup();
 try{
  const on={enabled:true,comment:true,reply:true,repost:true,like:true,share:true,chat:true,checkin:true};
  for(const user of ['alice','bob'])await db.notifications(user,'save',on);
  await dispatch(db,alice,'publish',{value:{content:'Reply notification example',coin:'BTC'}});
  const post=(await db.list('posts'))[0].id;
  const first=await dispatch(db,bob,'comment',{postId:post,content:'Parent comment',side:'support'});
  const reply=await dispatch(db,carol,'comment',{postId:post,replyToId:first.id,content:'Reply to Bob',side:'support'});
  let events=(await pg.query('select * from korae_notification_events')).rows;
  assert.equal(events.filter(row=>row.kind==='reply'&&row.uid==='bob').length,1);
  assert.ok(events.some(row=>row.event_key==='comment:'+post+':'+reply.id&&row.uid==='alice'));
  await dispatch(db,bob,'comment',{postId:post,replyToId:first.id,content:'My own reply',side:'support'});
  assert.equal((await pg.query("select count(*)::int n from korae_notification_events where kind='reply'")).rows[0].n,1);
  await db.notifications('bob','save',{...on,reply:false});
  await dispatch(db,carol,'comment',{postId:post,replyToId:first.id,content:'Muted reply',side:'support'});
  assert.equal((await pg.query("select count(*)::int n from korae_notification_events where kind='reply'")).rows[0].n,1);
  const own=await dispatch(db,alice,'comment',{postId:post,content:'Owner comment',side:'support'});
  const ownerReply=await dispatch(db,carol,'comment',{postId:post,replyToId:own.id,content:'Reply to owner',side:'support'});
  events=(await pg.query('select * from korae_notification_events')).rows.filter(row=>row.event_key.endsWith(ownerReply.id));
  assert.deepEqual(events.map(row=>row.kind),['reply']);
  await assert.rejects(dispatch(db,carol,'comment',{postId:post,replyToId:'missing',content:'Invalid parent',side:'support'}),/원댓글/);
 }finally{await pg.close();}
});

test('report, moderation and follow notices obey settings; deletion records survive restoration',async()=>{
 const {pg,db,rpc}=await setup();
 try{
 for(const name of ['202610160003_notification_inbox.sql','202610160004_moderation_follow_notifications.sql'])await pg.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 const inbox=()=>rpc("select korae_notification_inbox_page('alice') value");
 await db.notifications('alice','save',{enabled:true,report:true,moderation:true,follow:true});
 await db.notifications('alice','subscribe',{endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}});
 await dispatch(db,alice,'publish',{value:{content:'Snapshot of the reported post',coin:'BTC'}});
 const post=(await db.list('posts'))[0].id;
 await dispatch(db,bob,'reportContent',{kind:'posts',id:post});
 await dispatch(db,bob,'reportContent',{kind:'posts',id:post});
 let page=await inbox();assert.equal(page.items.length,1);assert.equal(page.items[0].kind,'report');assert.equal(JSON.stringify(page).includes('bob'),false);
 await dispatch(db,admin,'moderateContent',{kind:'posts',id:post,hidden:true});
 await dispatch(db,admin,'moderateContent',{kind:'posts',id:post,hidden:true});
 page=await inbox();assert.equal(page.items.filter(i=>i.kind==='moderation').length,1);assert.ok(page.items.every(i=>i.unavailable));assert.equal(page.items[0].details.summary,'Snapshot of the reported post');
 const jobs=await rpc('select korae_claim_push(50) value');assert.equal(jobs.filter(j=>j.kind==='moderation').length,1,'deletion push is not filtered out with hidden posts');
 await dispatch(db,admin,'moderateContent',{kind:'posts',id:post,hidden:false});
 page=await inbox();assert.ok(page.items.find(i=>i.kind==='moderation').unavailable);assert.equal(page.items.find(i=>i.kind==='report').unavailable,false);
 await db.notifications('alice','save',{enabled:false,report:false,moderation:false,follow:false});
 await dispatch(db,admin,'moderateContent',{kind:'posts',id:post,hidden:true});
 assert.equal((await inbox()).items.filter(i=>i.kind==='moderation').length,2,'mandatory inbox even with all pushes off');
 assert.equal((await pg.query("select count(*)::int n from korae_notification_events where kind='moderation'")).rows[0].n,1);
 const pin=await dispatch(db,alice,'savePin',{value:{title:'Private Pin summary',description:'Example',coin:'BTC',tradeCoins:[],category:'P2P 판매',lat:37,lng:127,image:'',link:''}});
 await dispatch(db,bob,'reportContent',{kind:'pins',id:pin.id});
 await dispatch(db,admin,'moderateContent',{kind:'pins',id:pin.id,hidden:true});
 page=await inbox();assert.equal(page.items[0].details.contentKind,'pins');assert.equal(page.items[0].details.summary,'Private Pin summary');
 await dispatch(db,bob,'follow',{id:'alice',enabled:true});
 assert.equal((await inbox()).items.filter(i=>i.kind==='follow').length,0);
 await db.notifications('alice','save',{enabled:true,follow:true});
 await dispatch(db,bob,'follow',{id:'alice',enabled:false});
 await dispatch(db,bob,'follow',{id:'alice',enabled:true});
 await dispatch(db,bob,'follow',{id:'alice',enabled:false});
 await dispatch(db,bob,'follow',{id:'alice',enabled:true});
 page=await inbox();assert.equal(page.items.filter(i=>i.kind==='follow').length,1,'same-day follow toggles do not spam');
 assert.equal(page.items.find(i=>i.kind==='follow').target,'bob');
 await pg.exec('delete from korae_notification_events');
 assert.equal((await inbox()).items.filter(i=>i.kind==='moderation').length,3);
 }finally{await pg.close();}
});

test('dismissing reports restores content and privately notifies every reporter and author once',async()=>{
 const {pg,db,rpc}=await setup();
 try{
 for(const name of ['202610160003_notification_inbox.sql','202610160004_moderation_follow_notifications.sql','202610160005_report_resolution.sql'])await pg.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 db.dismissReports=(identity,kind,id,reportId)=>rpc('select korae_dismiss_reports($1,$2,$3,$4,$5,$6) value',[identity.uid,identity.email,identity.emailVerified,kind,id,reportId]);
 await assert.rejects(dispatch(db,bob,'dismissReports',{kind:'posts',id:'p',reportId:1}));
 await assert.rejects(dispatch(db,admin,'dismissReports',{kind:'posts',id:'p',reportId:0}));
 await db.notifications('bob','save',{enabled:true,review:true});
 await dispatch(db,alice,'publish',{value:{content:'Content cleared after review',coin:'BTC'}});
 const post=(await db.list('posts'))[0].id;
 for(const person of [alice,bob,carol])await dispatch(db,person,'reportContent',{kind:'posts',id:post});
 const report=(await dispatch(db,admin,'adminReports')).items[0];
 await dispatch(db,admin,'moderateContent',{kind:'posts',id:post,hidden:true});
 assert.equal((await dispatch(db,admin,'dismissReports',{kind:'posts',id:post,reportId:report.reportId})).dismissed,true);
 assert.equal((await dispatch(db,admin,'adminReports')).items.length,0);
 assert.equal(await rpc("select korae_content_visible('posts',$1) value",[post]),true);
 const notices=(await pg.query("select uid,details,event_key from korae_notification_inbox where kind='review' order by uid")).rows;
 assert.deepEqual(notices.map(n=>n.uid),['alice','bob','carol']);
 assert.ok(notices.every(n=>n.details.summary==='Content cleared after review'));
 assert.deepEqual((await pg.query("select uid from korae_notification_events where kind='review'")).rows.map(n=>n.uid),['bob'],'push preferences respected; all three get inbox records');
 await dispatch(db,admin,'dismissReports',{kind:'posts',id:post,reportId:report.reportId});
 assert.equal((await pg.query("select count(*)::int n from korae_notification_inbox where kind='review'")).rows[0].n,3);
 await dispatch(db,bob,'reportContent',{kind:'posts',id:post});
 const newer=(await dispatch(db,admin,'adminReports')).items[0];assert.notEqual(newer.reportId,report.reportId);
 await dispatch(db,admin,'dismissReports',{kind:'posts',id:post,reportId:report.reportId});
 assert.equal((await dispatch(db,admin,'adminReports')).items.length,1,'stale retry cannot dismiss a new case');
 await dispatch(db,admin,'dismissReports',{kind:'posts',id:post,reportId:newer.reportId});
 const pin=await dispatch(db,alice,'savePin',{value:{title:'Reviewed Pin',description:'Example',coin:'BTC',tradeCoins:[],category:'P2P 판매',lat:37,lng:127,image:'',link:''}});
 await dispatch(db,bob,'reportContent',{kind:'pins',id:pin.id});
 const pinCase=(await dispatch(db,admin,'adminReports')).items[0];
 await dispatch(db,admin,'dismissReports',{kind:'pins',id:pin.id,reportId:pinCase.reportId});
 assert.equal((await pg.query("select count(*)::int n from korae_notification_inbox where kind='review' and details->>'contentKind'='pins'")).rows[0].n,2);
 await pg.exec('set role anon');
 await assert.rejects(pg.query("select korae_dismiss_reports('admin','gaebal2017@gmail.com',true,'posts','p',1)"),/permission denied/);
 await pg.exec('reset role');
 }finally{await pg.close();}
});
