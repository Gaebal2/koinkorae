import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(fetcher, entries=new Map(), fastTimeout=false){
 const handlers={},writes=[], waits=[];
 vm.runInNewContext(source,{
  self:{location:{href:'https://example.com/app/sw.js',origin:'https://example.com'},addEventListener:(type,fn)=>handlers[type]=fn},
  URL,Request:class {constructor(request){Object.assign(this,request);}},Response,fetch:fetcher,
  caches:{match:async req=>entries.get(typeof req==='string'?req:req.url),open:async()=>({put:async(req,res)=>writes.push([req,res])})},
  setTimeout:fastTimeout?(fn)=>setTimeout(fn,1):setTimeout,clearTimeout,
 });
 return {writes,waits,run(path,mode='cors'){
  let result;
  handlers.fetch({request:{url:'https://example.com'+path,method:'GET',mode},respondWith:value=>result=value,waitUntil:value=>waits.push(value)});
  return result;
 }};
}
test('cached immutable chunks start without any network request',async()=>{
 let calls=0;const response=new Response('cached');
 const app=worker(()=>{calls++;return Promise.reject(Error('offline'));},new Map([['https://example.com/app/assets/index-abcdefgh.js',response]]));
 assert.equal(await app.run('/app/assets/index-abcdefgh.js'),response);assert.equal(calls,0);
});
test('missing chunks are downloaded and saved',async()=>{
 const app=worker(async()=>new Response('new',{headers:{'content-type':'text/javascript'}}));
 assert.equal(await (await app.run('/app/assets/index-abcdefgh.js')).text(),'new');
 await Promise.all(app.waits);assert.equal(app.writes.length,1);
});
test('API responses are never intercepted',()=>{
 const app=worker(()=>{throw Error('must not fetch');});
 assert.equal(app.run('/app/api/profile'),undefined);
});
test('non-versioned assets still check network for updates',async()=>{
 const app=worker(async()=>new Response('fresh'),new Map([['https://example.com/app/icon.png',new Response('old')]]));
 assert.equal(await (await app.run('/app/icon.png')).text(),'fresh');
});
test('slow navigation falls back without waiting for network completion',async()=>{
 const cached=new Response('shell');
 const app=worker(()=>new Promise(()=>{}),new Map([['https://example.com/app/',cached]]),true);
 assert.equal(await app.run('/app/?post=123','navigate'),cached);
});
test('navigation prefers fresh HTML when network responds',async()=>{
 const app=worker(async()=>new Response('fresh',{headers:{'content-type':'text/html'}}),new Map([['https://example.com/app/',new Response('old')]]));
 assert.equal(await (await app.run('/app/','navigate')).text(),'fresh');
});
test('offline navigation restores cached shell for shared links',async()=>{
 const cached=new Response('shell');
 const app=worker(async()=>{throw Error('offline');},new Map([['https://example.com/app/',cached]]));
 assert.equal(await app.run('/app/?post=123','navigate'),cached);
});
