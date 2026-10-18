import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(){
 const handlers={},badges=[],notifications=[];let now=1;
 vm.runInNewContext(source,{self:{location:{href:'https://example.com/sw.js',origin:'https://example.com'},addEventListener:(type,fn)=>handlers[type]=fn,navigator:{setAppBadge:async n=>badges.push(n),clearAppBadge:async()=>badges.push(0)},registration:{showNotification:async(title,options)=>notifications.push(options)}},URL,Date:{now:()=>now},Math,Promise});
 const run=(type,value)=>{let wait;handlers[type]({data:type==='push'?{json:()=>value}:value,waitUntil:p=>wait=p});return wait;};
 return {badges,notifications,push:tag=>run('push',{tag}),read:before=>run('message',{type:'READ_NOTIFICATIONS',before}),reset:()=>run('message',{type:'RESET_BADGE'}),time:n=>now=n};
}
test('push sets numeric badge, deduplicates tags, and reading clears it',async()=>{
 const w=worker();await w.push('one');await w.push('one');await w.push('two');assert.deepEqual(w.badges,[1,1,2]);assert.equal(w.notifications.length,3);await w.read(1);assert.equal(w.badges.at(-1),0);
});
test('reading an inbox snapshot preserves notifications arriving after that snapshot',async()=>{
 const w=worker();await w.push('one');w.time(2);const incoming=w.push('two'),read=w.read(1);await Promise.all([incoming,read]);assert.equal(w.badges.at(-1),1);await w.reset();assert.equal(w.badges.at(-1),0);
});
