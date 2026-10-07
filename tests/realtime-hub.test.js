import test from 'node:test';
import assert from 'node:assert/strict';
import {createRealtimeHub} from '../supabase/functions/community/realtime-hub.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('shared realtime connection fans out public changes but isolates private users and cleans up only unused channels',async()=>{
 let clients=0;const channels=new Map(),removed=[];
 const hub=createRealtimeHub(async()=>{clients++;return {channel(topic){const ch={on(event,filter,fn){this.change=fn;return this;},subscribe(fn){this.status=fn;return this;}};channels.set(topic,ch);return ch;},removeChannel(ch){removed.push(ch);}};});
 const a=[],b=[],ready=[];
 const stopA=hub.subscribe('public',()=>ready.push('a'),x=>a.push(x),()=>{});
 const stopB=hub.subscribe('public',()=>ready.push('b'),x=>b.push(x),()=>{});
 const privateA=hub.subscribe('user:alice',()=>{},x=>a.push(x),()=>{});
 const privateB=hub.subscribe('user:bob',()=>{},x=>b.push(x),()=>{});
 await tick();assert.equal(clients,1);assert.equal(channels.size,3);
 channels.get('public').status('SUBSCRIBED');assert.deepEqual(ready,['a','b']);
 channels.get('public').change({payload:'public'});channels.get('user:alice').change({payload:'alice-only'});
 assert.deepEqual(a,['public','alice-only']);assert.deepEqual(b,['public']);
 stopA();await tick();assert.equal(removed.length,0);stopB();await tick();assert.equal(removed.length,1);
 channels.get('public').change({payload:'late'});assert.deepEqual(b,['public']);
 privateA();privateB();await tick();assert.equal(removed.length,3);
});
test('cancellation before initialization does not leak a channel and shared errors reach every active subscriber',async()=>{
 let resolve;const channels=[];const errors=[];
 const hub=createRealtimeHub(()=>new Promise(r=>{resolve=r;}));
 const stop=hub.subscribe('cancelled',()=>{},()=>{},()=>{});stop();await tick();
 resolve({channel(topic){const c={on(){return this;},subscribe(fn){this.status=fn;return this;}};channels.push(c);return c;},removeChannel(){}});
 await tick();assert.equal(channels.length,0);
 const a=hub.subscribe('active',()=>{},()=>{},e=>errors.push(e));const b=hub.subscribe('active',()=>{},()=>{},e=>errors.push(e));await tick();
 channels[0].status('CHANNEL_ERROR');assert.deepEqual(errors,['CHANNEL_ERROR','CHANNEL_ERROR']);a();b();
});
test('resubscription waits for old channel removal before creating a replacement',async()=>{
 let finishRemoval;let created=0;
 const hub=createRealtimeHub(()=>({channel(){created++;return {on(){return this;},subscribe(){return this;}};},removeChannel(){return new Promise(r=>{finishRemoval=r;});}}));
 const stop=hub.subscribe('public',()=>{},()=>{},()=>{});await tick();stop();
 const next=hub.subscribe('public',()=>{},()=>{},()=>{});await tick();assert.equal(created,1);
 finishRemoval();await tick();assert.equal(created,2);next();await tick();finishRemoval();
});
