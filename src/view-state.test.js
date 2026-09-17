import test from 'node:test';
import assert from 'node:assert/strict';
import { readViewState, saveViewState, defaultOptions } from './view-state.js';
test('reload restores each screen, profile identity and all feed filters', () => {
  let stored;
  const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  for (const page of ['home', 'check', 'profile', 'map']) {
    const state = { page, profileId: 'member-id', options: { feed: '코인 피드', category: '최신', period: '전체' } };
    saveViewState(storage, state);
    assert.deepEqual(readViewState(storage), state);
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
