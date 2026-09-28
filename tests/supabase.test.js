import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { dispatch } from '../supabase/functions/community/handler.js';
import { pin } from '../supabase/functions/community/validation.js';
import { createCommunityClient } from '../src/supabase-client.js';

test('Supabase transaction rules, ownership, retries and private data',async()=>{
  const pg=new PGlite();
  try {
    await pg.exec('create role anon; create role authenticated; create role service_role;');
    await pg.exec(await readFile(new URL('../supabase/migrations/202609280001_community.sql',import.meta.url),'utf8'));
    const db={
      async one(kind,id,parent=''){return (await pg.query('select * from korae_documents where kind=$1 and id=$2 and parent=$3',[kind,id,parent])).rows[0] || null;},
      async list(kind,filter={}){return (await pg.query('select * from korae_documents where kind=$1 and ($2::text is null or owner=$2) and ($3::text is null or parent=$3)',[kind,filter.owner || null,filter.parent || null])).rows;},
      async put(row,ignore=false){await pg.query(`insert into korae_documents values ($1,$2,$3,$4,$5) on conflict(kind,parent,id) do ${ignore?'nothing':'update set body=excluded.body'}`,[row.kind,row.id,row.parent,row.owner,JSON.stringify(row.body)]);},
      async remove(kind,id,parent,owner){await pg.query('delete from korae_documents where kind=$1 and id=$2 and parent=$3 and owner=$4',[kind,id,parent,owner]);},
      async mutate(action,uid,id,value){return (await pg.query('select korae_mutate($1,$2,$3,$4) as result',[action,uid,id,JSON.stringify(value)])).rows[0].result;},
    };
    const a={uid:'alice',name:'Alice'},b={uid:'bob',name:'Bob'};
    for(const action of ['savePin','publish','checkin','startBattle','finishBattle','ownComments','balance']) await assert.rejects(dispatch(db,null,action),/로그인/);
    await dispatch(db,a,'ensureProfile');await dispatch(db,a,'saveProfile',{value:{bio:'hello',profileImage:''}});await dispatch(db,a,'ensureProfile');
    assert.equal((await dispatch(db,null,'profile',{id:'alice'})).bio,'hello');
    await Promise.all(Array.from({length:5},()=>dispatch(db,a,'checkin')));
    assert.equal((await dispatch(db,a,'balance',{uid:'alice'})).current,10);
    await assert.rejects(dispatch(db,b,'balance',{uid:'alice'}),/본인/);
    const value={title:'Pin',description:'Sale',coin:'PI',tradeCoins:['BTC'],link:'',image:'',category:'판매',lat:37,lng:127,ownerId:'bob'};
    const p=await dispatch(db,a,'savePin',{value});
    assert.equal(p.ownerId,'alice');
    await dispatch(db,a,'savePin',{value});await dispatch(db,a,'savePin',{value});
    await assert.rejects(dispatch(db,a,'savePin',{value}),/최대 3개/);
    await assert.rejects(dispatch(db,b,'savePin',{value,id:p.id}),/수정/);
    await dispatch(db,b,'deletePin',{id:p.id});assert.ok(await db.one('pins',p.id));
    await dispatch(db,a,'publish',{value:{content:'hello',coin:'PI',support:999,authorId:'bob'}});
    const post=(await dispatch(db,null,'posts'))[0];assert.equal(post.support,0);assert.equal(post.authorId,'alice');
    const s=await dispatch(db,a,'startBattle',{postId:post.id,side:'support',requestId:'r1'});
    assert.deepEqual(await dispatch(db,a,'startBattle',{postId:post.id,side:'support',requestId:'r1'}),s);
    await assert.rejects(dispatch(db,b,'finishBattle',{sessionId:'r1',inputs:[]}),/다른 배틀/);
    await assert.rejects(dispatch(db,a,'finishBattle',{sessionId:'r1',inputs:[-1]}),/잘못된/);
    await pg.query(`update korae_documents set body=body||jsonb_build_object('startedAt',((body->>'startedAt')::bigint-60000)) where kind='battleSessions' and id='alice'`);
    const result=await dispatch(db,a,'finishBattle',{sessionId:'r1',inputs:[]});
    assert.deepEqual(await dispatch(db,a,'finishBattle',{sessionId:'r1',inputs:[]}),result);
    // Nonzero concurrent scoring is applied exactly once per session by SQL.
    await dispatch(db,a,'startBattle',{postId:post.id,side:'support',requestId:'r2'});
    const s2=(await db.one('battleSessions','alice')).body;
    const score={side:'support',score:7,delta:7,sessionSeed:s2.seed,sessionStartedAt:s2.startedAt,postId:post.id};
    await assert.rejects(db.mutate('finishBattle','alice','r2',{...score,sessionSeed:s2.seed+1}),/다른 배틀/);
    await Promise.all([db.mutate('finishBattle','alice','r2',score),db.mutate('finishBattle','alice','r2',score)]);
    assert.equal((await db.one('posts',post.id)).body.support,result.score+7);
    await dispatch(db,b,'startBattle',{postId:post.id,side:'oppose',requestId:'r3'});
    const s3=(await db.one('battleSessions','bob')).body;
    await db.mutate('finishBattle','bob','r3',{side:'oppose',score:3,delta:-3,sessionSeed:s3.seed,sessionStartedAt:s3.startedAt,postId:post.id});
    assert.equal((await db.one('posts',post.id)).body.oppose,3);
    await dispatch(db,b,'comment',{postId:post.id,content:'hi',side:'oppose'});
    const original=(await dispatch(db,null,'comments',{postId:post.id}))[0];
    await dispatch(db,a,'comment',{postId:post.id,content:'reply',side:'support',replyToId:original.id});
    const reply=(await dispatch(db,null,'comments',{postId:post.id})).find(c=>c.content==='reply');
    assert.deepEqual(reply.replyTo,{id:original.id,author:'Bob',content:'hi'});
    assert.equal(reply.side,'support');
    await assert.rejects(dispatch(db,a,'comment',{postId:post.id,content:'invalid',side:'support',replyToId:'missing'}));
    await dispatch(db,a,'publish',{value:{content:'another post',coin:'PI'}});
    const other=(await dispatch(db,null,'posts')).find(p=>p.id!==post.id);
    await assert.rejects(dispatch(db,a,'comment',{postId:other.id,content:'wrong parent',side:'oppose',replyToId:original.id}));
    await dispatch(db,b,'repost',{postId:post.id,enabled:true});await dispatch(db,b,'repost',{postId:post.id,enabled:true});
    assert.equal((await db.list('reposts')).length,1);
    assert.equal((await dispatch(db,b,'ownComments'))[0].post.id,post.id);
    await assert.rejects(dispatch(db,b,'deletePost',{id:post.id}),/삭제/);
    await dispatch(db,a,'deletePost',{id:post.id});assert.equal((await db.list('comments')).length,0);assert.equal((await db.list('reposts')).length,0);
    await db.put({kind:'comments',id:'orphan',parent:post.id,owner:'alice',body:{content:'orphan'}});
    assert.deepEqual(await dispatch(db,null,'comments',{postId:post.id}),[]);
    assert.equal(await dispatch(db,null,'commentCount',{postId:post.id}),0);
    for(const role of ['anon','authenticated']) {
      await pg.exec(`set role ${role}`);
      await assert.rejects(pg.query('select * from korae_documents'),/permission denied/);
      await assert.rejects(pg.query("select korae_mutate('checkin','alice')"),/permission denied/);
      await pg.exec('reset role');
    }
  } finally {await pg.close();}
});

test('Pin payload rejects unsafe coordinates, categories, images and links',()=>{
  const value={title:'Pin',description:'Sale',coin:'PI',tradeCoins:[],image:'',link:'',category:'판매',lat:0,lng:0};
  for(const changes of [{lat:Infinity},{lat:91},{lng:-181},{category:'x'},{image:'https://bad'},{link:'javascript:alert(1)'},{tradeCoins:['bad coin']}]) assert.throws(()=>pin({...value,...changes}));
});

test('client refreshes expired tokens and suppresses callbacks after unsubscribe',async()=>{
  const refreshes=[];let calls=0,resolve;
  const client=createCommunityClient({url:'https://example.test',token:async force=>{refreshes.push(force);return 'token';},fetcher:async()=>{calls++;return calls===1?{status:401,ok:false}:new Promise(r=>{resolve=()=>r({status:200,ok:true,json:async()=>({data:[]})});});}});
  let callbacks=0;const stop=client.watch('posts',{},()=>callbacks++);
  await new Promise(r=>setImmediate(r));stop();resolve();await new Promise(r=>setImmediate(r));
  assert.deepEqual(refreshes,[false,true]);assert.equal(callbacks,0);
});

test('deployed battle replay files match the game engine',async()=>{
  for(const file of ['battle-engine.js','battle-validation.js']) assert.equal(await readFile(`functions/${file}`,'utf8'),await readFile(`supabase/functions/_shared/${file}`,'utf8'));
});
