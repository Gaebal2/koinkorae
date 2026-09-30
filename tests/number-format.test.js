import test from 'node:test';
import assert from 'node:assert/strict';
import {formatCompactNumber as format} from '../src/number-format.js';

test('feed numbers use locale-independent K/M/B with one decimal and preserve signs',()=>{
  for(const [value,text] of [[0,'0'],[999,'999'],[1000,'1.0K'],[1250,'1.3K'],[10000,'10.0K'],[100000,'100.0K'],[1000000,'1.0M'],[10000000,'10.0M'],[1000000000,'1.0B'],[1234567890,'1.2B']]){
    assert.equal(format(value),text);
    if(value)assert.equal(format(-value),'-'+text);
  }
  assert.equal(format(-0),'0');
});
test('rounding promotes K to M and M to B without displaying 1000.0K/M',()=>{
  assert.equal(format(999949),'999.9K');
  assert.equal(format(999950),'1.0M');
  assert.equal(format(-999950),'-1.0M');
  assert.equal(format(999950000),'1.0B');
  for(const value of [undefined,null,NaN,Infinity,-Infinity])assert.equal(format(value),'0');
});
