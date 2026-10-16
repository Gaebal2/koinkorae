import test from 'node:test';import assert from 'node:assert/strict';import {createAnalytics,MEASUREMENT_ID} from '../src/analytics.js';
test('GA initializes once, counts screen changes, and omits private URL data',()=>{
 const scripts=[],win={location:{hostname:'koinkorae.com',origin:'https://koinkorae.com',href:'https://koinkorae.com/?profile=private-user'},navigator:{}},doc={referrer:'https://example.com/?email=private',head:{appendChild:s=>scripts.push(s)},createElement:()=>({})};const track=createAnalytics(win,doc);
 track('home');track('home');track('profile');track('home');track('unknown');
 assert.equal(scripts.length,1);assert.ok(scripts[0].async);assert.ok(scripts[0].src.includes(MEASUREMENT_ID));
 const events=win.dataLayer.map(a=>Array.from(a));assert.equal(events.filter(e=>e[0]==='config').length,1);assert.equal(events.filter(e=>e[1]==='page_view').length,3);assert.equal(events.find(e=>e[0]==='config')[2].send_page_view,false);assert.ok(!JSON.stringify(events).includes('private'));
});
test('local previews, GPC and unavailable browser APIs cannot disrupt the app',()=>{
 for(const win of [{location:{hostname:'localhost'},navigator:{}},{location:{hostname:'koinkorae.com'},navigator:{globalPrivacyControl:true}}]){createAnalytics(win,{} )('home');assert.equal(win.dataLayer,undefined);}
 assert.doesNotThrow(()=>createAnalytics({location:{hostname:'koinkorae.com'},navigator:{}},{})('home'));
});
