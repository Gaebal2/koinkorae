import test from 'node:test';
import assert from 'node:assert/strict';
import {communityHarness} from './community-harness.js';
import {dispatch} from '../supabase/functions/community/handler.js';

test('map coin filter matches primary or tradable coins and counts all matches independently of bounds/cursors',async()=>{
  const {pg,db}=await communityHarness();
  try {
    for(const [id,coin,tradeCoins,lat,lng] of [['a','BTC',[],37,127],['b','ETH',['BTC'],37,127],['c','BTC',['BTC'],0,0],['d','SOL',[],37,127]])
      await db.put({kind:'pins',id,parent:'',owner:'alice',body:{ownerId:'alice',coin,tradeCoins,lat,lng,title:id}});
    const options={mode:'pins',coin:'BTC',bounds:[36,126,38,128]};
    const first=await dispatch(db,null,'page',{options,limit:1});
    assert.equal(first.totalCount,3);assert.deepEqual(first.items.map(p=>p.id),['a']);
    const next=await dispatch(db,null,'page',{options,limit:1,cursor:first.nextCursor});
    assert.equal(next.totalCount,3);assert.deepEqual(next.items.map(p=>p.id),['b']);assert.equal(next.nextCursor,null);
    const empty=await dispatch(db,null,'page',{options:{...options,coin:'XRP'}});
    assert.equal(empty.totalCount,0);assert.deepEqual(empty.items,[]);
    const all=await dispatch(db,null,'page',{options:{mode:'pins'}});assert.equal(all.totalCount,4);
    await db.remove('pins','b','','alice');
    assert.equal((await dispatch(db,null,'page',{options})).totalCount,2);
  } finally {await pg.close();}
});

test('attendance keeps known history through duplicate check-in and unrelated balance writes without inventing missing dates',async()=>{
  const {pg,db}=await communityHarness();
  try {
    const today=Math.floor((Date.now()+32400000)/86400000);
    await db.put({kind:'balances',id:'alice',parent:'',owner:'alice',body:{current:10,lifetime:10,day:today-2}});
    let balance=(await db.one('balances','alice')).body;
    assert.deepEqual(balance.checkinDays,[today-2]);assert.equal(balance.historySince,today);
    await dispatch(db,{uid:'alice'},'checkin');await dispatch(db,{uid:'alice'},'checkin');
    balance=(await dispatch(db,{uid:'alice'},'balance',{uid:'alice'}));
    assert.deepEqual(balance.checkinDays,[today-2,today]);assert.equal(balance.current,20);
    await db.put({kind:'balances',id:'alice',parent:'',owner:'alice',body:{current:19,lifetime:20,day:today}});
    balance=(await db.one('balances','alice')).body;
    assert.deepEqual(balance.checkinDays,[today-2,today]);assert.equal(balance.historySince,today);
    await assert.rejects(dispatch(db,null,'balance',{uid:'alice'}),/로그인/);
  } finally {await pg.close();}
});
