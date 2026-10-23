import test from 'node:test';
import assert from 'node:assert/strict';
import { readViewState, saveViewState, defaultOptions } from './view-state.js';
test('reload restores screen, profile and validated feed filters', () => {
  let stored;
  const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  const values = new Map();
  const preferences = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  for (const page of ['home', 'check', 'profile', 'map', 'chat', 'battle']) {
    const state = { page, profileId: 'member-id', options: { feed: '코인 피드', category: '최신', period: '전체' } };
    saveViewState(storage, state, preferences);
    assert.deepEqual(readViewState(storage, preferences), state);
  }
});
test('corrupt or disabled storage safely uses valid defaults', () => {
  for (const value of ['null', '{', '{"page":"bad","options":{"period":"invalid"}}']) {
    assert.deepEqual(readViewState({ getItem: () => value }), { page: 'home', profileId: null, options: defaultOptions });
  }
  const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(readViewState(storage).page, 'home');
  assert.doesNotThrow(() => saveViewState(storage, {}));
});

test('feed preferences survive new sessions and exclude transient selection', () => {
 const values=new Map(), preferences={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const session={getItem:()=>null,setItem(){}};
 assert.deepEqual(readViewState(session,preferences).options,{feed:'유저 피드',category:'최신',period:'전체'});
 saveViewState(session,{page:'profile',options:{feed:'코인 피드',category:'좋아요',period:'이번 달',focusCoin:'BTC'}},preferences);
 assert.deepEqual(readViewState(session,preferences),{page:'home',profileId:null,options:{feed:'코인 피드',category:'좋아요',period:'이번 달'}});
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 assert.equal(readViewState(blocked,preferences).options.category,'좋아요');
 assert.doesNotThrow(()=>saveViewState(blocked,{},blocked));
 preferences.setItem('korae-feed-preferences','{"category":"bad","period":"오늘"}');
 assert.deepEqual(readViewState(session,preferences).options,{feed:'유저 피드',category:'최신',period:'오늘'});
});
