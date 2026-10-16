import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {communityHarness} from './community-harness.js';
import {dispatch} from '../supabase/functions/community/handler.js';
import {notificationPayload,notificationTarget} from '../supabase/functions/community/notifications.js';
test('inbox persists successful delivery once, survives cleanup, isolates accounts and paginates',async()=>{
 const {pg,db}=await communityHarness({pointsPolicy:true});
 try{
 for(const name of ['202610160001_notifications.sql','202610160002_reports_and_replies.sql','202610160003_notification_inbox.sql'])await pg.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 db.notificationInbox=async(uid,before)=>(await pg.query('select korae_notification_inbox_page($1,$2) value',[uid,before])).rows[0].value;
 await assert.rejects(dispatch(db,null,'notificationInbox'));
 await assert.rejects(dispatch(db,{uid:'alice'},'notificationInbox',{before:'-1'}));
 await pg.exec("insert into korae_notification_events(event_key,uid,kind,target) values ('e1','alice','reply','post1');insert into korae_push_subscriptions(endpoint,uid,subscription) values ('device1','alice','{}'),('device2','alice','{}');insert into korae_push_deliveries(event_key,endpoint,lease_token) values ('e1','device1','00000000-0000-0000-0000-000000000001'),('e1','device2','00000000-0000-0000-0000-000000000002');");
 await pg.exec("select korae_finish_push(1,'00000000-0000-0000-0000-000000000099',201);select korae_finish_push(1,'00000000-0000-0000-0000-000000000001',503)");
 assert.equal((await dispatch(db,{uid:'alice'},'notificationInbox')).items.length,0);
 await pg.exec("select korae_finish_push(1,'00000000-0000-0000-0000-000000000001',201);select korae_finish_push(2,'00000000-0000-0000-0000-000000000002',201);select korae_finish_push(1,'00000000-0000-0000-0000-000000000001',201)");
 let page=await dispatch(db,{uid:'alice'},'notificationInbox',{uid:'bob'});
 assert.equal(page.items.length,1);assert.equal(page.items[0].kind,'reply');
 assert.equal((await dispatch(db,{uid:'bob'},'notificationInbox',{uid:'alice'})).items.length,0);
 await pg.exec("delete from korae_notification_events;insert into korae_notification_inbox(uid,event_key,kind,target) select 'alice','page'||n,'like','p' from generate_series(1,24) n");
 page=await dispatch(db,{uid:'alice'},'notificationInbox');assert.equal(page.items.length,20);assert.ok(page.nextCursor);
 const next=await dispatch(db,{uid:'alice'},'notificationInbox',{before:page.nextCursor});assert.equal(next.items.length,5);assert.equal(next.nextCursor,null);assert.equal(new Set([...page.items,...next.items].map(i=>i.id)).size,25);
 await pg.exec('set role anon');
 await assert.rejects(pg.query("select * from korae_notification_inbox"),/permission denied/);
 await assert.rejects(pg.query("select korae_notification_inbox_page('alice')"),/permission denied/);
 await pg.exec('reset role');
 }finally{await pg.close();}
});
test('push opens inbox while inbox links open their corresponding content',()=>{
 for(const kind of ['comment','reply','like','share','repost','chat','checkin'])assert.equal(notificationPayload({kind,target:'p'}).url,'?screen=notifications');
 assert.equal(notificationTarget({kind:'reply',target:'p?x'}),'?post=p%3Fx');
 assert.equal(notificationTarget({kind:'chat'}),'?screen=chat');
 assert.equal(notificationTarget({kind:'checkin'}),'?screen=check');
});
