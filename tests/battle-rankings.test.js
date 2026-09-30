import test from 'node:test';
import assert from 'node:assert/strict';
import {communityHarness} from './community-harness.js';
import {dispatch} from '../supabase/functions/community/handler.js';
import {newBattleProgress} from '../functions/battle-progress.js';

async function endedSession(db,uid,postId,side,score,round=0) {
  const progress=newBattleProgress('runner',42);
  progress.game.ended=true;progress.game.score=score;progress.round=round;progress.lastCompletedAt=1700000000000+score;
  const session={id:crypto.randomUUID(),protocol:2,gameVersion:3,postId,side,status:'playing',startedAt:Date.now()-10000,progress};
  await db.put({kind:'battleSessions',id:uid,parent:'',owner:uid,body:session});return session;
}
test('contributor totals apply once, include both sides and every round, and propagate repost contributions',async()=>{
  const {pg,db}=await communityHarness();try{
    const a={uid:'a',name:'Alice'},b={uid:'b',name:'Bob'};
    await dispatch(db,a,'ensureProfile');await dispatch(db,b,'ensureProfile');
    await dispatch(db,a,'publish',{value:{content:'Ranking',coin:'SL'}});
    const post=(await dispatch(db,null,'posts'))[0];
    let s=await endedSession(db,'a',post.id,'support',100,2);
    assert.equal((await dispatch(db,a,'battleRankings',{postId:post.id})).mine,null);
    await Promise.all([dispatch(db,a,'applyBattle',{sessionId:s.id}),dispatch(db,a,'applyBattle',{sessionId:s.id})]);
    s=await endedSession(db,'a',post.id,'oppose',70);
    await dispatch(db,a,'applyBattle',{sessionId:s.id});
    let ranking=await dispatch(db,a,'battleRankings',{postId:post.id});
    assert.equal(ranking.mine.total,170);assert.equal(ranking.mine.support,100);assert.equal(ranking.mine.oppose,70);
    assert.equal(ranking.mine.games,4);assert.equal(ranking.mine.lastCompletedAt,1700000000100);
    assert.deepEqual(ranking.summary,{participants:1,total:170});
    const repost=await dispatch(db,b,'repost',{postId:post.id,enabled:true});
    s=await endedSession(db,'b',repost.id,'oppose',80);
    await dispatch(db,b,'applyBattle',{sessionId:s.id});
    ranking=await dispatch(db,b,'battleRankings',{postId:post.id});
    assert.deepEqual(ranking.summary,{participants:2,total:250});assert.equal(ranking.mine.rank,2);
    assert.equal((await dispatch(db,b,'battleRankings',{postId:repost.id})).mine.total,80);
    await dispatch(db,b,'saveProfile',{value:{username:'Renamed',bio:'',profileImage:'data:image/png;base64,AAAA'}});
    assert.equal((await dispatch(db,b,'battleRankings',{postId:post.id})).mine.username,'Renamed');
    await assert.rejects(dispatch(db,b,'deletePost',{id:post.id}));
    assert.equal((await dispatch(db,a,'battleRankings',{postId:post.id})).summary.total,250);
    await dispatch(db,b,'repost',{postId:post.id,enabled:false});
    assert.equal((await pg.query('select count(*) n from korae_battle_totals where post_id=$1',[repost.id])).rows[0].n,0);
    assert.equal((await dispatch(db,a,'battleRankings',{postId:post.id})).summary.total,250);
    await dispatch(db,a,'deletePost',{id:post.id});
    assert.equal((await pg.query('select count(*) n from korae_battle_contributors')).rows[0].n,0);
    await assert.rejects(dispatch(db,null,'battleRankings',{postId:post.id}));
  }finally{await pg.close();}
});

test('ranking pages cap at 100, resolve ties, expose own rank outside top 100 and use all participants for shares',async()=>{
  const {pg,db}=await communityHarness();try{
    await db.put({kind:'posts',id:'post',parent:'',owner:'a',body:{coin:'SL',content:'Ranks',support:0,oppose:0}});
    await pg.exec("insert into korae_battle_totals(post_id) values('post'); insert into korae_battle_contributors(post_id,user_id,support,oppose,games,last_completed_at) select 'post','u'||lpad(n::text,3,'0'),120-n,0,1,1700000000000 from generate_series(1,120) n; update korae_battle_totals set participants=120,support=(select sum(total) from korae_battle_contributors);");
    await pg.exec("update korae_battle_contributors set support=100 where user_id in ('u019','u020','u021'); update korae_battle_totals set support=(select sum(total) from korae_battle_contributors);");
    let cursor=null,items=[],count=0,last;
    do{last=await dispatch(db,{uid:'u120'},'battleRankings',{postId:'post',cursor});items.push(...last.items);cursor=last.nextCursor;count++;assert.equal(last.items.length,20);}while(cursor&&count<10);
    assert.equal(count,5);assert.equal(items.length,100);assert.equal(new Set(items.map(r=>r.userId)).size,100);
    assert.deepEqual(items.map(r=>r.rank),Array.from({length:100},(_,i)=>i+1));
    assert.equal(last.mine.rank,120);assert.equal(last.mine.total,0);assert.equal(last.mine.games,1);
    assert.equal(last.summary.participants,120);assert.ok(last.summary.total>items.reduce((n,r)=>n+r.total,0));
    assert.equal((await dispatch(db,null,'battleRankings',{postId:'post'})).mine,null);
    for(const cursor of [[-1,'a'],[1],[1,{}],[1.2,'a'],[1,'bad/id']])await assert.rejects(dispatch(db,null,'battleRankings',{postId:'post',cursor}));
    await pg.exec('set role anon');
    await assert.rejects(pg.query('select * from korae_battle_contributors'));
    await assert.rejects(pg.query("select korae_battle_rankings('post','u001',null)"));
    await pg.exec('reset role');
  }finally{await pg.close();}
});
