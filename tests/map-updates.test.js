import test from 'node:test';
import assert from 'node:assert/strict';
import {bufferedBounds,containsBounds,retainMapResult,reconcileMarkers} from '../src/map-updates.js';

test('map buffer reuses nearby moves and zoom-in, but reloads outside coverage and on zoom-out',()=>{
  const buffer=bufferedBounds([30,120,40,140]);
  assert.deepEqual(buffer,[27.5,115,42.5,145]);
  assert.equal(containsBounds(buffer,[31,122,41,142]),true);
  assert.equal(containsBounds(buffer,[33,125,37,135]),true);
  assert.equal(containsBounds(buffer,[20,110,50,150]),false);
  assert.equal(containsBounds(buffer,[33,140,37,150]),false);
  assert.equal(containsBounds(null,[30,120,40,140]),false);
});

test('map coverage handles date line, full world and poles',()=>{
  const buffer=bufferedBounds([-10,170,10,-170]);
  assert.equal(containsBounds(buffer,[-8,175,8,-175]),true);
  assert.equal(containsBounds(buffer,[-8,-179,8,-169]),true);
  assert.equal(containsBounds(buffer,[-8,-160,8,-150]),false);
  assert.equal(containsBounds(buffer,[-8,-175,8,175]),false);
  assert.deepEqual(bufferedBounds([-80,-180,80,180]),[-90,-180,90,180]);
  assert.equal(containsBounds([-90,-180,90,180],buffer),true);
});

test('map keeps pins while loading or failed, replaces success including empty, and isolates accounts',()=>{
  const original={scope:'a',items:[{id:'old'}]};
  const loading={items:[],loading:true,error:null};
  assert.equal(retainMapResult(original,loading,'a'),original);
  assert.equal(retainMapResult(original,{...loading,loading:false,error:Error('offline')},'a'),original);
  assert.deepEqual(retainMapResult(original,loading,'b').items,[]);
  assert.deepEqual(retainMapResult(original,{...loading,loading:false},'a').items,[]);
  const items=[{id:'new'}];
  assert.equal(retainMapResult(original,{items,loading:false,error:null},'a').items,items);
});

test('marker reconciliation retains identity and latest click data, adds new pins and removes deleted pins',()=>{
  const index=new Map(),removed=[];let created=0;
  const operations={create:pin=>({id:pin.id,identity:++created}),update:(marker,pin)=>{marker.pinData=pin;},remove:marker=>removed.push(marker.id)};
  reconcileMarkers(index,[{id:'a',coin:'BTC'},{id:'b',coin:'PI'}],operations);
  const original=index.get('a');
  reconcileMarkers(index,[{id:'a',coin:'SL'},{id:'c',coin:'ETH'}],operations);
  assert.equal(index.get('a'),original);
  assert.equal(original.pinData.coin,'SL');assert.equal(created,3);assert.deepEqual(removed,['b']);
  reconcileMarkers(index,[],operations);assert.equal(index.size,0);assert.deepEqual(removed,['b','a','c']);
});
