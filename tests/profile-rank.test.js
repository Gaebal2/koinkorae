import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {communityHarness} from './community-harness.js';
import {rankIndex} from '../src/rank-artwork.js';
test('rank badges clamp invalid values and prefer public earned rank',()=>{
 assert.equal(rankIndex({rankLevel:5,level:1}),5);
 for(const rankLevel of [NaN,Infinity,'invalid',-1])assert.equal(rankIndex({rankLevel}),0);
 assert.equal(rankIndex({rankLevel:999}),6);
});
test('earned rank is projected once into profiles and pages without exposing balance',async()=>{
 const {pg,db}=await communityHarness({pointsPolicy:true});
 try{
  await pg.exec(await readFile(new URL('../supabase/migrations/202610210001_profile_rank.sql',import.meta.url),'utf8'));
  await db.put({kind:'profiles',id:'alice',parent:'',owner:'alice',body:{username:'Alice'}});
  await db.put({kind:'balances',id:'alice',parent:'',owner:'alice',body:{current:123,level:4}});
  const profile=await db.one('profiles','alice');
  assert.equal(profile.body.rankLevel,4);assert.equal(profile.body.current,undefined);assert.equal(profile.body.stats,undefined);
  await db.mutate('updateProfile','alice','',{username:'Renamed'});
  assert.equal((await db.one('profiles','alice')).body.rankLevel,4);
  await db.put({kind:'posts',id:'post',parent:'',owner:'alice',body:{authorId:'alice',coin:'BTC',content:'Ranked post',createdAt:1,support:0,oppose:0}});
  const page=await db.page(null,{mode:'posts'},null,20);
  assert.equal(page.items[0].authorProfile.rankLevel,4);
  assert.equal(page.items[0].authorProfile.current,undefined);
  await pg.exec('truncate realtime.test_events');
  await db.put({kind:'balances',id:'alice',parent:'',owner:'alice',body:{current:99,level:4}});
  const events=(await pg.query('select payload from realtime.test_events')).rows;
  assert.ok(!events.some(row=>row.payload.kind==='profiles'));
  await db.put({kind:'balances',id:'alice',parent:'',owner:'alice',body:{current:99,level:5}});
  assert.equal((await db.one('profiles','alice')).body.rankLevel,5);
 }finally{await pg.close();}
});
