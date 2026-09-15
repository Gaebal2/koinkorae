import test from 'node:test';
import assert from 'node:assert/strict';
import {prioritizeCoins} from './coins.js';
test('featured coins lead and duplicates are removed without changing others order',()=>{const list=prioritizeCoins([{symbol:'BTC'},{symbol:'PI'},{symbol:'sl'},{symbol:'ETH'},{symbol:'PSL'},{symbol:'BTC'}]);assert.deepEqual(list.map(c=>c.symbol),['PI','SL','PSL','BTC','ETH'])});
