import test from 'node:test';
import assert from 'node:assert/strict';
import {communityHarness} from './community-harness.js';
import {dispatch} from '../supabase/functions/community/handler.js';
import {feedOptions,periodStart} from '../src/feed-period.js';

test('controversy ranks absolute totals while trending ranks activity in user and coin feeds',async()=>{
  const {pg,db}=await communityHarness();try{
    const now=Date.now(),user={uid:'a',name:'Alice'};
    await dispatch(db,user,'ensureProfile');
    for(const [id,coin,support,oppose] of [['lifetime','BTC',10000,100],['active','ETH',1,0],['quiet','SL',100,100],['negative','PSL',-20000,0]]){
      await db.put({kind:'posts',id,parent:'',owner:'a',body:{authorId:'a',coin,content:id,createdAt:now-172800000,support,oppose}});
    }
    const page=async(category,mode='posts',cursor=null)=>dispatch(db,null,'page',{options:{mode,category},cursor});
    assert.equal((await page('논쟁')).items[0].id,'negative');
    assert.equal((await page('논쟁','coins')).items[0].coin,'PSL');
    // Existing lifetime battle totals do not count as recent changes.
    assert.equal((await pg.query('select count(*) n from korae_feed_battle_activity')).rows[0].n,0);
    for(const [kind,id,parent,stamp] of [['comments','c','active',now-60000],['likes','a','active',now-60000],['reposts','b','active',now-60000],['comments','expired','lifetime',now-86400001],['likes','old','lifetime',now-90000000],['comments','future','quiet',now+3600000]]){
      await db.put({kind,id,parent,owner:id,body:{createdAt:stamp}});
    }
    assert.equal((await page('급상승')).items[0].id,'active');
    assert.equal((await page('급상승','coins')).items[0].coin,'ETH');
    const score=async(id,at=now,since=0)=>(await pg.query('select korae_feed_activity_score($1,$2,$3) score',[id,at,since])).rows[0].score;
    assert.ok(await score('lifetime')>0);assert.equal(await score('lifetime',now,now-86400000),0);assert.equal(await score('quiet'),0);
    const before=await score('active');assert.ok(before>0);
    await db.remove('likes','a','active','a');
    assert.ok(Math.abs(await score('active')-before*2/3)<=1);
    await db.put({kind:'likes',id:'a',parent:'active',owner:'a',body:{createdAt:now-60000}});
    assert.equal(await score('active'),before);
    assert.ok(await score('active',now+3600000)<before);
    assert.ok(await score('active',now+86400000)>0);
    assert.equal(await score('active',now+86400000,now),0);
    // Score-only updates are captured; unrelated post edits are not.
    await pg.exec("update korae_documents set body=jsonb_set(body,'{oppose}','10') where kind='posts' and id='quiet'");
    assert.equal((await page('급상승')).items[0].id,'quiet');
    const magnitude=(await pg.query("select sum(magnitude) n from korae_feed_battle_activity where post_id='quiet'")).rows[0].n;
    assert.equal(Number(magnitude),90);
    await pg.exec("update korae_documents set body=body||'{\"content\":\"edited\"}' where kind='posts' and id='quiet'");
    assert.equal((await pg.query("select sum(magnitude) n from korae_feed_battle_activity where post_id='quiet'")).rows[0].n,magnitude);
    // A paging chain carries its evaluation time, so ordinary time decay
    // does not move items across the cursor between pages.
    const first=await dispatch(db,null,'page',{options:{mode:'posts',category:'급상승'},limit:1});
    assert.equal(first.nextCursor.length,4);
    const second=await dispatch(db,null,'page',{options:{mode:'posts',category:'급상승'},cursor:first.nextCursor,limit:1});
    assert.equal(second.items[0].id,'active');assert.equal(second.nextCursor[3],first.nextCursor[3]);
    await assert.rejects(dispatch(db,null,'page',{options:{mode:'posts',category:'급상승'},cursor:[1,1,'a','invalid']}));
    await assert.rejects(dispatch(db,null,'page',{options:{mode:'posts',category:'최신'},cursor:first.nextCursor}));
    await db.remove('posts','quiet','','a');
    assert.equal((await pg.query("select count(*) n from korae_feed_battle_activity where post_id='quiet'")).rows[0].n,0);
    await pg.exec('set role anon');
    await assert.rejects(pg.query('select * from korae_feed_battle_activity'));
  }finally{await pg.close();}
});

test('today/month/year/all select activity timestamps, retain battle history and share coin-feed order',async()=>{
  const {pg,db}=await communityHarness();try{
    const now=Date.now(),year=periodStart('올해',now),month=periodStart('이번 달',now),today=periodStart('오늘',now);
    const events=[['prior-year','BTC',year-60000,1e9],['prior-month','ETH',month-60000,1e7],['yesterday','SL',today-60000,1e5],['today','PSL',today,1]];
    for(const [id,coin,stamp,amount] of events){
      await db.put({kind:'posts',id,parent:'',owner:'a',body:{coin,authorId:'a',createdAt:year-86400000,support:0,oppose:0,content:id}});
      await pg.query('insert into korae_feed_battle_activity values($1,$2,$3)',[id,Math.floor(stamp/60000),amount]);
    }
    for(const period of ['오늘','이번 달','올해','전체']){
      const options=feedOptions({feed:'유저 피드',category:'급상승',period},now),since=periodStart(period,now);
      const page=await dispatch(db,null,'page',{options});
      for(const [id,,stamp] of events){
        const row=page.items.find(p=>p.id===id);
        assert.equal(row.score>0,stamp>=since,`${period}: ${id}`);
      }
      const coins=await dispatch(db,null,'page',{options:{...options,mode:'coins'}});
      assert.equal(coins.items[0].coin,page.items[0].coin);
    }
    // A new battle update must not prune the prior-year bucket needed by 전체.
    await pg.exec("update korae_documents set body=jsonb_set(body,'{support}','1') where kind='posts' and id='prior-year'");
    assert.equal((await pg.query("select count(*) n from korae_feed_battle_activity where post_id='prior-year'")).rows[0].n,2);
    await assert.rejects(dispatch(db,null,'page',{options:{mode:'posts',category:'급상승',activitySince:-1}}));
  }finally{await pg.close();}
});
