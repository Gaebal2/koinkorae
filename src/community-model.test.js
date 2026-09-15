import test from 'node:test';
import assert from 'node:assert/strict';
import {coinRanks,relationshipsFor,tierFor} from './community-model.js';
test('coin ranks aggregate signed exposure across authors, including negative totals',()=>{const ranks=coinRanks([{coin:'BTC',support:10,oppose:0},{coin:'ETH',support:20,oppose:0},{coin:'BTC',support:15,oppose:0},{coin:'SL',support:0,oppose:4}]);assert.deepEqual([...ranks],[['BTC',1],['ETH',2],['SL',3]])});
test('friends are mutual follows and duplicate edges do not inflate counts',()=>{assert.deepEqual(relationshipsFor([{from:'a',to:'b'},{from:'b',to:'a'},{from:'c',to:'a'},{from:'a',to:'b'},{from:'a',to:'d'}],'a'),{following:['b','d'],followers:['b','c'],friends:['b']})});
test('tier boundaries and progress use lifetime rather than current BP',()=>{assert.equal(tierFor(999).tier,'Bronze');assert.equal(tierFor(1000).tier,'Silver');assert.equal(tierFor(9999).tier,'Silver');assert.deepEqual(tierFor(10000),{tier:'Gold',next:null,progress:100})});
