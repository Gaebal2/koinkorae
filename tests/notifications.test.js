import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {communityHarness} from './community-harness.js';
import {dispatch} from '../supabase/functions/community/handler.js';
import {preferences,subscription,notificationPayload} from '../supabase/functions/community/notifications.js';
const enabled={enabled:true,comment:true,repost:true,like:true,share:true,chat:true,checkin:true};
const device=(name='alice')=>({endpoint:'https://fcm.googleapis.com/fcm/send/'+name,keys:{p256dh:'A'.repeat(87),auth:'B'.repeat(22)}});
test('notification validation rejects arbitrary endpoints, malformed keys and nonboolean settings',()=>{
 assert.equal(preferences({}).enabled,false);
 for(const value of [{enabled:'true'},{uid:'other'},null,[]])assert.throws(()=>preferences(value));
 for(const endpoint of ['http://fcm.googleapis.com/','https://127.0.0.1/','https://fcm.googleapis.com.evil.com/','https://fcm.googleapis.com:8443/','https://user@web.push.apple.com/'])assert.throws(()=>subscription({...device(),endpoint}));
 assert.throws(()=>subscription({...device(),keys:{p256dh:'short',auth:'short'}}));
 assert.deepEqual(subscription(device()),device());
 assert.equal(notificationPayload({kind:'chat',target:'private',event_key:'1'}).url,'?screen=chat');
 assert.ok(!JSON.stringify(notificationPayload({kind:'chat',content:'secret'})).includes('secret'));
});
test('notification actions require verified identity and cannot select another account',async()=>{
 const calls=[],db={notifications:async(...args)=>{calls.push(args);return {};},pushPublicKey:'public'};
 for(const action of ['notificationSettings','saveNotificationSettings','subscribePush','unsubscribePush'])await assert.rejects(dispatch(db,null,action),/로그인/);
 await dispatch(db,{uid:'alice'},'saveNotificationSettings',{uid:'bob',value:enabled});
 assert.equal(calls[0][0],'alice');
 await dispatch(db,null,'recordShare',{postId:'post'});assert.equal(calls[1][0],null);
});
test('transactional events, preferences, retries, devices, check-in boundaries and private access',async()=>{
 const {pg,db}=await communityHarness({pointsPolicy:true});
 try{
  await pg.exec(await readFile(new URL('../supabase/migrations/202610160001_notifications.sql',import.meta.url),'utf8'));
  db.notifications=async(uid,action,value={})=>(await pg.query('select korae_notification_settings($1,$2,$3) as value',[uid,action,JSON.stringify(value)])).rows[0].value;
  const actor={uid:'bob',name:'Bob'},owner={uid:'alice',name:'Alice'};
  for(const person of [actor,owner])await dispatch(db,person,'ensureProfile');
  await db.notifications('alice','save',enabled);
  await db.notifications('alice','subscribe',device());
  await dispatch(db,owner,'publish',{value:{content:'A post for notification tests',coin:'BTC'}});
  const post=(await db.list('posts'))[0].id;
  const events=async()=>(await pg.query('select * from korae_notification_events order by event_key')).rows;
  await dispatch(db,owner,'like',{postId:post,enabled:true});assert.equal((await events()).length,0,'self activity');
  await dispatch(db,actor,'like',{postId:post,enabled:true});
  await dispatch(db,actor,'like',{postId:post,enabled:true});
  await dispatch(db,actor,'like',{postId:post,enabled:false});
  await dispatch(db,actor,'like',{postId:post,enabled:true});
  assert.equal((await events()).filter(e=>e.kind==='like').length,1,'like deduplication');
  await dispatch(db,actor,'comment',{postId:post,content:'A comment',side:'support'});
  await dispatch(db,actor,'repost',{postId:post,enabled:true});
  await dispatch(db,actor,'repost',{postId:post,enabled:true});
  await dispatch(db,null,'recordShare',{postId:post});
  await dispatch(db,null,'recordShare',{postId:post});
  assert.deepEqual((await events()).map(e=>e.kind).sort(),['comment','like','repost','share']);
  for(const [person,id] of [[actor,'alice'],[owner,'bob']])await dispatch(db,person,'follow',{id,enabled:true});
  await dispatch(db,actor,'sendMessage',{friendId:'alice',requestId:'message-1',content:'Private message'});
  await dispatch(db,actor,'sendMessage',{friendId:'alice',requestId:'message-1',content:'Private message'});
  assert.equal((await events()).filter(e=>e.kind==='chat').length,1);
  const claim=async()=>(await pg.query('select korae_claim_push(50) as value')).rows[0].value;
  const jobs=await claim();assert.equal(jobs.length,5);
  assert.equal((await claim()).length,0,'leased deliveries not claimed twice');
  await pg.query('select korae_finish_push($1,$2,503)',[jobs[0].id,jobs[0].lease]);
  await pg.exec("update korae_push_deliveries set available_at=now()-interval '1 second' where lease_until is null");
  assert.equal((await claim()).length,1,'temporary failure retries');
  await db.notifications('alice','save',{...enabled,enabled:false});
  assert.equal((await pg.query('select count(*)::int as n from korae_push_deliveries where not done')).rows[0].n,0);
  await db.notifications('alice','save',{...enabled,comment:false});
  await dispatch(db,actor,'comment',{postId:post,content:'Muted comment',side:'support'});
  assert.equal((await events()).filter(e=>e.kind==='comment').length,1);
  await db.notifications('alice','save',enabled);
  await dispatch(db,owner,'checkin');
  await pg.exec('select korae_queue_due_checkins()');
  assert.equal((await events()).filter(e=>e.kind==='checkin').length,0,'already checked in today');
  await pg.exec("update korae_documents set body=jsonb_set(body,'{day}',to_jsonb((body->>'day')::integer-1)) where kind='balances' and id='alice'");
  await pg.exec('select korae_queue_due_checkins();select korae_queue_due_checkins()');
  assert.equal((await events()).filter(e=>e.kind==='checkin').length,1,'next KST day reminder exactly once');
  await db.notifications('bob','subscribe',device());
  assert.equal((await claim()).length,0,'account switch deletes old queued notifications');
  await db.notifications('alice','unsubscribe',{endpoint:device().endpoint});
  assert.equal((await pg.query('select uid from korae_push_subscriptions')).rows[0].uid,'bob','cannot remove other account device');
  await pg.exec('set role anon');
  await assert.rejects(pg.query('select * from korae_push_subscriptions'),/permission denied/);
  await assert.rejects(pg.query("select korae_notification_settings('alice','get')"),/permission denied/);
  await pg.exec('reset role');
 }finally{await pg.close();}
});

test('push displays a private summary and notification click stays in app origin',async()=>{
 const handlers={},shown=[],opened=[];
 const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
 const self={location:{href:'https://example.com/app/sw.js',origin:'https://example.com'},addEventListener:(name,handler)=>handlers[name]=handler,
 registration:{showNotification:async(title,options)=>shown.push({title,...options})},
 clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(source,{self,URL,Request,Response,setTimeout,clearTimeout});
 let pending;
 handlers.push({data:{json:()=>({title:'Update',body:'A new message',url:'https://evil.example',tag:'event'})},waitUntil:value=>pending=value});
 await pending;assert.equal(shown[0].data.url,'https://example.com/app/');
 let closed=false;handlers.notificationclick({notification:{data:{url:'?screen=chat'},close:()=>closed=true},waitUntil:value=>pending=value});
 await pending;assert.equal(closed,true);assert.equal(opened[0],'https://example.com/app/?screen=chat');
});
