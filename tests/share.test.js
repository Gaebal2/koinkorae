import test from 'node:test';
import assert from 'node:assert/strict';
import {shareUrl,shareContent} from '../src/share.js';
test('links identify a single item and remove unrelated query and hash',()=>{
 assert.equal(shareUrl('post','a b','https://example.com/app/?pin=old#x'),'https://example.com/app/?post=a+b');
 assert.equal(shareUrl('pin','abc','https://example.com/'),'https://example.com/?pin=abc');
});
test('native sharing, cancellation, clipboard fallback and manual fallback',async()=>{
 const payload={url:'https://example.com/?post=abc'};let copied;
 assert.equal(await shareContent(payload,{share:async value=>assert.equal(value,payload)}),'shared');
 assert.equal(await shareContent(payload,{share:async()=>{throw Object.assign(Error(),{name:'AbortError'});},clipboard:{writeText:()=>assert.fail()}}),'cancelled');
 assert.equal(await shareContent(payload,{share:async()=>{throw Error();},clipboard:{writeText:async value=>{copied=value;}}}),'copied');assert.equal(copied,payload.url);
 assert.equal(await shareContent(payload,{}),'manual');
 assert.equal(await shareContent(payload,{clipboard:{writeText:async()=>{throw Error();}}}),'manual');
});

test('public share URLs use the canonical production origin',()=>{
 assert.equal(shareUrl('post','post-1'),'https://koinkorae.com/?post=post-1');
 assert.equal(shareUrl('pin','pin-1'),'https://koinkorae.com/?pin=pin-1');
});
test('shared post resolves its real author without a signed-in user',async()=>{
 const {resolveSharedPost}=await import('../src/shared-link.js');
 const post={id:'old',authorId:'author'},profile={id:'author'};
 const data={postsById:async ids=>{assert.deepEqual(ids,['old']);return [post];},profile:async id=>{assert.equal(id,'author');return profile;}};
 assert.deepEqual(await resolveSharedPost(data,'old'),{post,profile});
 await assert.rejects(resolveSharedPost({...data,postsById:async()=>[]},'old'),/missing/);
 await assert.rejects(resolveSharedPost({...data,profile:async()=>null},'old'),/missing/);
 await assert.rejects(resolveSharedPost({...data,postsById:async()=>{throw Error('offline');}},'old'),/offline/);
});
test('profile target search loads older pages, handles pinned posts, and stops on errors or missing posts',async()=>{
 const {sharedPostStatus}=await import('../src/shared-link.js');
 const page={items:[{id:'new'}],nextCursor:'next',loading:false,error:null};
 assert.equal(sharedPostStatus(page,'old'),'more');
 assert.equal(sharedPostStatus({...page,loading:true},'old'),'loading');
 assert.equal(sharedPostStatus({...page,error:Error()},'old'),'error');
 assert.equal(sharedPostStatus({...page,nextCursor:null},'old'),'missing');
 assert.equal(sharedPostStatus({...page,items:[...page.items,{id:'old'}]},'old'),'found');
 assert.equal(sharedPostStatus(page,'old','old'),'found');
 assert.equal(sharedPostStatus(page,null),'found');
});
test('PWA launches navigate an existing app to the shared URL without changing app identity',async()=>{
 const {readFileSync}=await import('node:fs');const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.launch_handler.client_mode,'navigate-existing');
 assert.equal(manifest.id,'./?app=koin-korae-blue-v3');
 assert.equal(new URL('?post=old','https://koinkorae.com/').pathname.startsWith(new URL(manifest.scope,'https://koinkorae.com/manifest.webmanifest').pathname),true);
});
