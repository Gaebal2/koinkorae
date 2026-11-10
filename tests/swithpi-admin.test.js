import test from 'node:test';
import assert from 'node:assert/strict';
import {readSwithpiApplications} from '../supabase/functions/_shared/swithpi-admin.js';
const admin={uid:'admin',email:'gaebal2017@gmail.com',emailVerified:true};
test('admin applications reject unauthorized identities before database access',async()=>{
 const client={from(){assert.fail('Unexpected database access');}};
 for(const identity of [null,{...admin,emailVerified:false},{...admin,email:'other@gmail.com'},{...admin,uid:''}])await assert.rejects(readSwithpiApplications(client,identity),/관리자/);
});
function database(rows){return {from(table){let filters=[],head=false,limit=Infinity;return {
 select(_columns,options={}){head=options.head;return this;},eq(key,value){filters.push(row=>row[key]===value);return this;},is(key){filters.push(row=>row[key]==null);return this;},not(key){filters.push(row=>row[key]!=null);return this;},gt(key,value){filters.push(row=>row[key]>Number(value));return this;},order(){return this;},limit(value){limit=value;return this;},then(resolve){const data=(table==='korae_airdrop_events'?[{id:'event',title:'Test'}]:rows).filter(row=>filters.every(filter=>filter(row)));resolve({data:head?null:data.slice(0,limit),count:data.length});}
 };}};}
test('admin applications paginate and filter with correct totals',async()=>{
 const rows=Array.from({length:55},(_,i)=>({sequence:i+1,event_id:'event',allocation:i<52?null:10,paid_at:i===54?'2026-11-10':null}));
 const client=database(rows),first=await readSwithpiApplications(client,admin,{});
 assert.equal(first.total,55);assert.equal(first.entries.length,50);assert.equal(first.next,'50');
 const last=await readSwithpiApplications(client,admin,{after:first.next});assert.equal(last.total,55);assert.equal(last.entries.length,5);assert.equal(last.next,null);
 for(const [status,total] of [['pending',52],['allocated',2],['paid',1]])assert.equal((await readSwithpiApplications(client,admin,{status})).total,total);
 await assert.rejects(readSwithpiApplications(client,admin,{eventId:'missing'}));
 await assert.rejects(readSwithpiApplications(client,admin,{after:'invalid'}));
});
