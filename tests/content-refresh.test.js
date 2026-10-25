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

test('home links and buttons can pull to refresh while taps, horizontal gestures and overlays stay separate', async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/content-refresh.jsx',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('    let start = null'),source.indexOf('  }, [page]);'));
 const listeners=new Map();let runs=0,distance=0;
 const document={body:{},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const cleanup=new Function('document','window','contentRefresh','page','setDistance','setBusy','setError','getComputedStyle',body)(document,{scrollY:0},{has:()=>true,run:async()=>{runs++;}},'home',value=>{distance=value;},()=>{},()=>{},()=>({overflowY:'visible'}));
 const image={closest:()=>null,parentElement:document.body};
 const control={closest:selector=>selector==='button:not(.post-image), a'?{}:null,parentElement:document.body};
 const overlay={closest:()=>({}),parentElement:document.body};
 const touch=(target,x,y)=>({target,touches:[{clientX:x,clientY:y}],cancelable:true,preventDefault(){}});
 listeners.get('touchstart')(touch(image,0,0));listeners.get('touchmove')(touch(image,1,150));assert.equal(distance,75);
 await listeners.get('touchend')();assert.equal(runs,1);
 let prevented=false;listeners.get('click')({preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,true);
 listeners.get('touchstart')(touch(image,0,0));await listeners.get('touchend')();prevented=false;listeners.get('click')({preventDefault(){prevented=true;},stopImmediatePropagation(){}});assert.equal(prevented,false);assert.equal(runs,1);
 listeners.get('touchstart')(touch(control,0,0));listeners.get('touchmove')(touch(control,0,150));await listeners.get('touchend')();assert.equal(runs,2);
 listeners.get('touchstart')(touch(overlay,0,0));listeners.get('touchmove')(touch(overlay,0,150));await listeners.get('touchend')();assert.equal(runs,2);
 listeners.get('touchstart')(touch(image,0,0));listeners.get('touchmove')(touch(image,160,20));await listeners.get('touchend')();assert.equal(runs,2);
 listeners.get('touchstart')(touch(image,0,0));listeners.get('touchmove')(touch(image,0,150));listeners.get('touchcancel')();await listeners.get('touchend')();assert.equal(runs,2);
 cleanup();assert.equal(listeners.size,0);
});
