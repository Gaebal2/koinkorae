import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { communityHarness } from './community-harness.js';
import { dispatch } from '../supabase/functions/community/handler.js';

test('repost comments, canonical originals, latest pages and author profiles remain distinct', async () => {
  const {pg, db} = await communityHarness();
  const alice={uid:'alice',name:'Alice'}, bob={uid:'bob',name:'Bob'};
  try {
    await dispatch(db,alice,'ensureProfile'); await dispatch(db,bob,'ensureProfile');
    for (const [id,createdAt] of [['old',1000],['new',2000]]) await db.put({kind:'posts',id,parent:'',owner:'alice',body:{authorId:'alice',author:'Alice',content:id,coin:'PSL',createdAt,support:10,oppose:2}});
    await assert.rejects(dispatch(db,null,'repost',{postId:'old',enabled:true}),/로그인/);
    await assert.rejects(dispatch(db,bob,'repost',{postId:'old',enabled:true,comment:'가'.repeat(101)}),/100/);
    await assert.rejects(db.mutate('repost','bob','',{postId:'old',enabled:true,comment:'a'.repeat(101)}),/100/);
    const first=await dispatch(db,bob,'repost',{postId:'new',enabled:true,comment:'First'});
    const second=await dispatch(db,bob,'repost',{postId:'old',enabled:true,comment:'가'.repeat(100)});
    // Retries preserve the original comment and timestamp, without duplicate feeds.
    assert.deepEqual(await dispatch(db,bob,'repost',{postId:second.id,enabled:true,comment:'retry'}),second);
    assert.equal((await db.one('posts',second.id)).body.repostComment,'가'.repeat(100));
    const profile=await dispatch(db,bob,'page',{options:{category:'최신',repostedBy:'bob'}});
    assert.deepEqual(profile.items.map(p=>p.id),[second.id,first.id]);
    assert.equal(profile.items[0].authorProfile.username,'Alice');
    assert.equal(profile.items[0].repostProfile.username,'Bob');
    assert.equal(profile.items[0].originalCreatedAt,1000);
    const authored=await dispatch(db,bob,'page',{options:{category:'최신',author:'alice'}});
    assert.deepEqual(authored.items.map(p=>p.id),['new','old']);
    assert.equal((await dispatch(db,bob,'page',{options:{category:'최신',author:'bob'}})).items.length,0);
    let cursor=null, all=[];
    do { const page=await dispatch(db,bob,'page',{options:{category:'최신'},cursor,limit:1}); all.push(...page.items); cursor=page.nextCursor; } while(cursor);
    assert.deepEqual(all.map(p=>p.id),[second.id,first.id,'new','old']);
    const nested=await dispatch(db,alice,'repost',{postId:second.id,enabled:true,comment:'Nested'});
    assert.equal((await db.one('posts',nested.id)).body.originalPostId,'old');
    await assert.rejects(dispatch(db,alice,'deletePost',{id:second.id}),/삭제/);
    await dispatch(db,bob,'repost',{postId:second.id,enabled:false});
    assert.equal(await db.one('posts',second.id),null);
    assert.ok(await db.one('posts','old'));
    await dispatch(db,alice,'deletePost',{id:'old'});
    assert.equal(await db.one('posts',nested.id),null);
    assert.equal((await db.list('reposts',{parent:'old'})).length,0);
  } finally { await pg.close(); }
});

test('repost battles add support or oppose to both feeds exactly once, including concurrent retries', async () => {
  const {pg,db}=await communityHarness();
  try {
    await db.put({kind:'posts',id:'original',parent:'',owner:'alice',body:{authorId:'alice',author:'Alice',coin:'PSL',content:'Original',createdAt:1000,support:10,oppose:0}});
    const repost=await dispatch(db,{uid:'bob'},'repost',{postId:'original',enabled:true,comment:'Battle here'});
    for (const side of ['support','oppose']) {
      await db.put({kind:'battleSessions',id:'player',parent:'',owner:'player',body:{id:side,postId:repost.id,side,protocol:2,status:'playing',progress:{bankedScore:3,game:{ended:true,score:4}}}});
      await assert.rejects(dispatch(db,{uid:'intruder'},'applyBattle',{sessionId:side}),/배틀/);
      const results=await Promise.all(Array.from({length:4},()=>dispatch(db,{uid:'player'},'applyBattle',{sessionId:side})));
      assert.ok(results.every(r=>r.score===7));
      assert.equal((await db.one('posts',repost.id)).body[side],7);
      assert.equal((await db.one('posts','original')).body[side],side==='support'?17:7);
    }
    await db.put({kind:'battleSessions',id:'legacy',parent:'',owner:'legacy',body:{id:'legacy-session',postId:repost.id,side:'support',status:'playing',seed:42,startedAt:Date.now()}});
    const old=(await db.one('battleSessions','legacy')).body;
    const value={postId:repost.id,side:'support',score:5,delta:5,sessionSeed:42,sessionStartedAt:old.startedAt};
    await Promise.all([db.mutate('finishBattle','legacy',old.id,value),db.mutate('finishBattle','legacy',old.id,value)]);
    assert.equal((await db.one('posts',repost.id)).body.support,12);
    assert.equal((await db.one('posts','original')).body.support,22);
    await db.put({kind:'battleSessions',id:'player',parent:'',owner:'player',body:{id:'deleted',postId:repost.id,side:'support',protocol:2,status:'playing',progress:{bankedScore:0,game:{ended:true,score:1}}}});
    await dispatch(db,{uid:'alice'},'deletePost',{id:'original'});
    await assert.rejects(dispatch(db,{uid:'player'},'applyBattle',{sessionId:'deleted'}),/삭제/);
    assert.equal((await db.one('battleSessions','player')).body.status,'playing');
  } finally { await pg.close(); }
});

test('historic repost migration preserves timestamps and is safe to reapply',async()=>{
  const {pg,db}=await communityHarness();
  try {
    await db.put({kind:'posts',id:'historic',parent:'',owner:'alice',body:{authorId:'alice',author:'Alice',coin:'PSL',content:'Old',createdAt:1000,support:30,oppose:2}});
    await db.put({kind:'reposts',id:'bob',parent:'historic',owner:'bob',body:{createdAt:2500}});
    const sql=await readFile(new URL('../supabase/migrations/202609300003_repost_feeds.sql',import.meta.url),'utf8');
    await pg.exec(sql);await pg.exec(sql);
    const page=await db.page('bob',{mode:'posts',category:'최신',repostedBy:'bob'},null,20);
    assert.equal(page.items.length,1);assert.equal(page.items[0].createdAt,2500);
    assert.equal(page.items[0].support,0);assert.equal(page.items[0].repostComment,'');
  } finally {await pg.close();}
});
