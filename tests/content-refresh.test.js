import test from 'node:test';
import assert from 'node:assert/strict';
import {createContentRefresh} from '../src/content-refresh.js';
import {createPagedStore} from '../src/paged-store.js';
test('refresh targets mounted content only, coalesces gestures, and unregisters cleanly', async () => {
 const bus=createContentRefresh(); let feed=0, friends=0, release;
 const stop=bus.subscribe('home',()=>{feed++;return new Promise(resolve=>{release=resolve;});});
 bus.subscribe('chat',()=>{friends++;});
 const first=bus.run('home'); assert.equal(bus.run('home'),first);
 await Promise.resolve();assert.equal(feed,1);assert.equal(friends,0);
 await bus.run('check');await bus.run('battle');assert.equal(feed,1);assert.equal(friends,0);
 release();await first;stop();assert.equal(bus.has('home'),false);
 await bus.run('home');assert.equal(feed,1);await bus.run('chat');assert.equal(friends,1);
});
test('failed refresh can be retried', async()=>{
 const bus=createContentRefresh();let calls=0;
 bus.subscribe('home',()=>{if(++calls===1)throw Error('offline');});
 await assert.rejects(bus.run('home'),/offline/);await bus.run('home');assert.equal(calls,2);
});
test('feed keeps existing rows while fetching and after a failed refresh',async()=>{
 let load=async()=>({items:[{id:'old'}],nextCursor:null}), release;
 const store=createPagedStore({load:(...args)=>load(...args),observe:()=>()=>{}});
 const entry=store.get({mode:'posts'});const stop=entry.subscribe(()=>{});
 await new Promise(resolve=>setTimeout(resolve,0));
 load=()=>new Promise(resolve=>{release=resolve;});
 const refreshing=entry.refresh();assert.equal(entry.getSnapshot().items[0].id,'old');
 release({items:[{id:'new'},{id:'old'}],nextCursor:null});await refreshing;
 assert.equal(entry.getSnapshot().items.length,2);
 load=async()=>{throw Error('offline');};await entry.refresh();assert.equal(entry.getSnapshot().items.length,2);
 stop();
});
