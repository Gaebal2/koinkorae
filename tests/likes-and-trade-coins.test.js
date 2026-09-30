import test from 'node:test';
import assert from 'node:assert/strict';
import {communityHarness} from './community-harness.js';
import {dispatch} from '../supabase/functions/community/handler.js';
import {pin} from '../supabase/functions/community/validation.js';
import {toggleTradeCoin} from '../src/trade-coins.js';
import {filterFeed} from '../src/feed-model.js';
import {readViewState} from '../src/view-state.js';
import {createCommunityClient} from '../src/supabase-client.js';

test('trade coins keep selection order, reselected coins append, and the 21st coin is blocked', () => {
  let chosen=[];
  for(let i=0;i<20;i++)chosen=toggleTradeCoin(chosen,'C'+i);
  assert.equal(toggleTradeCoin(chosen,'extra'),chosen);
  chosen=toggleTradeCoin(chosen,'C4');
  assert.equal(chosen.length,19);assert.equal(chosen[4],'C5');
  chosen=toggleTradeCoin(chosen,'C4');
  assert.equal(chosen.at(-1),'C4');assert.equal(chosen.indexOf('C5'),4);
  const value={title:'Trade',description:'Ordered coins',coin:'PI',tradeCoins:chosen,category:'P2P 판매',lat:37,lng:127};
  assert.deepEqual(pin(value).tradeCoins,chosen);
  assert.throws(()=>pin({...value,tradeCoins:[...chosen,'extra']}),/20/);
  assert.throws(()=>pin({...value,tradeCoins:['BTC','BTC']}),/중복/);
});

test('likes are authenticated, idempotent, separate from scores, ranked globally and deleted with the post',async()=>{
  const {pg,db}=await communityHarness();
  const alice={uid:'alice'},bob={uid:'bob'};
  try {
    for(const [id,coin,stamp] of [['a','BTC',1000],['b','BTC',2000],['c','ETH',3000]])
      await db.put({kind:'posts',id,parent:'',owner:'alice',body:{authorId:'alice',author:'Alice',coin,createdAt:stamp,content:id,support:9,oppose:2}});
    await assert.rejects(dispatch(db,null,'like',{postId:'a',enabled:true}),/로그인/);
    await assert.rejects(dispatch(db,alice,'like',{postId:'missing',enabled:true}),/삭제/);
    await assert.rejects(dispatch(db,alice,'like',{postId:'a',enabled:'true'}),/잘못/);
    await Promise.all(Array.from({length:5},()=>dispatch(db,alice,'like',{postId:'a',enabled:true})));
    await dispatch(db,bob,'like',{postId:'a',enabled:true,uid:'alice'});
    await dispatch(db,alice,'like',{postId:'b',enabled:true});
    await dispatch(db,bob,'like',{postId:'c',enabled:true});
    assert.equal((await db.one('posts','a')).body.likeCount,2);
    assert.equal((await db.one('posts','a')).body.support,9);
    const page=await dispatch(db,alice,'page',{options:{category:'좋아요'},limit:1});
    assert.equal(page.items[0].id,'a');assert.equal(page.items[0].liked,true);assert.equal(page.items[0].likeCount,2);
    const next=await dispatch(db,alice,'page',{options:{category:'좋아요'},cursor:page.nextCursor,limit:1});
    assert.equal(next.items[0].id,'c');assert.equal(next.items[0].liked,false);
    const last=await dispatch(db,null,'page',{options:{category:'좋아요'},cursor:next.nextCursor,limit:1});
    assert.equal(last.items[0].id,'b');assert.equal(last.items[0].liked,false);assert.equal(last.nextCursor,null);
    const coins=await dispatch(db,alice,'page',{options:{mode:'coins',category:'좋아요'}});
    assert.equal(coins.items[0].coin,'BTC');assert.equal(coins.items[0].score,3);
    const period=await dispatch(db,alice,'page',{options:{category:'좋아요',since:1500}});
    assert.deepEqual(period.items.map(p=>p.id),['c','b']);
    await Promise.all(Array.from({length:4},()=>dispatch(db,alice,'like',{postId:'a',enabled:false})));
    assert.equal((await db.one('posts','a')).body.likeCount,1);
    assert.ok(await db.one('likes','bob','a'));assert.equal(await db.one('likes','alice','a'),null);
    await dispatch(db,alice,'like',{postId:'a',enabled:true});
    assert.equal((await db.one('posts','a')).body.likeCount,2);
    const events=(await pg.query("select payload from realtime.test_events where payload->>'kind'='likes'")).rows;
    assert.equal(events.length,0);
    await assert.rejects(dispatch(db,bob,'deletePost',{id:'a'}),/삭제/);
    await dispatch(db,alice,'deletePost',{id:'a'});
    assert.equal((await db.list('likes',{parent:'a'})).length,0);
    await assert.rejects(dispatch(db,bob,'like',{postId:'a',enabled:true}),/삭제/);
    await pg.exec('set role anon');
    await assert.rejects(pg.query("select korae_mutate('like','alice','b','{\"enabled\":true}')"),/permission denied/);
    await pg.exec('reset role');
    const value={title:'Pin',description:'Ordered',coin:'PI',tradeCoins:['ETH','BTC','SL'],category:'P2P 판매',lat:37,lng:127};
    const saved=await dispatch(db,alice,'savePin',{value});
    assert.deepEqual((await dispatch(db,alice,'getPin',{id:saved.id})).tradeCoins,value.tradeCoins);
    await assert.rejects(db.mutate('savePin','alice',saved.id,{...value,tradeCoins:Array.from({length:21},(_,i)=>'C'+i)}),/20/);
  } finally {await pg.close();}
});

test('like filters retain canonical values and fallback ranking uses count rather than support',()=>{
  const posts=[{id:'a',coin:'BTC',createdAt:1000,support:100,oppose:0,likeCount:1},{id:'b',coin:'ETH',createdAt:2000,support:0,oppose:0,likeCount:5}];
  const result=filterFeed(posts,{category:'좋아요',period:'전체'},[],3000);
  assert.deepEqual(result.posts.map(p=>p.id),['b','a']);assert.equal(result.groups[0].coin,'ETH');
  const state=readViewState({getItem:()=>JSON.stringify({options:{category:'좋아요'}})});
  assert.equal(state.options.category,'좋아요');
});

test('saving a like invalidates feed pages without refreshing unrelated balances',async()=>{
  const calls=[],invalidations=[];
  const client=createCommunityClient({url:'https://example.test',token:async()=>null,fetcher:async(_,request)=>{
    calls.push(JSON.parse(request.body).action);return {ok:true,json:async()=>({data:{}})};
  }});
  const stop=client.observe(actions=>invalidations.push(actions));
  await client.call('page',{options:{category:'좋아요'}});
  await client.call('like',{postId:'a',enabled:true});
  await client.call('page',{options:{category:'좋아요'}});
  assert.deepEqual(calls,['page','like','page']);assert.ok(invalidations[0].includes('page'));assert.ok(!invalidations[0].includes('balance'));
  stop();
});
