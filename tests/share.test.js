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
