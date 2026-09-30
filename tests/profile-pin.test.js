import test from 'node:test';
import assert from 'node:assert/strict';
import {communityHarness} from './community-harness.js';
import {dispatch} from '../supabase/functions/community/handler.js';

test('profile pins persist, enforce ownership, preserve home order, replace, unpin and clear on deletion',async()=>{
  const {pg,db}=await communityHarness();try{
    const a={uid:'alice',name:'Alice'},b={uid:'bob',name:'Bob'};
    for(const user of [a,b])await dispatch(db,user,'ensureProfile');
    for(let i=0;i<25;i++)await db.put({kind:'posts',id:'post'+i,parent:'',owner:a.uid,body:{authorId:a.uid,author:'Alice',coin:'SL',content:'Post '+i,createdAt:i,support:0,oppose:0}});
    await assert.rejects(dispatch(db,null,'pinProfilePost',{id:'post0',enabled:true}),/로그인/);
    await assert.rejects(dispatch(db,b,'pinProfilePost',{id:'post0',enabled:true}),/내 피드/);
    await assert.rejects(dispatch(db,a,'pinProfilePost',{id:'missing',enabled:true}));
    await dispatch(db,a,'pinProfilePost',{id:'post0',enabled:true});
    await dispatch(db,a,'saveProfile',{value:{username:'New Alice',bio:'Updated',pinnedPostId:'post3'}});
    assert.equal((await dispatch(db,null,'profile',{id:a.uid})).pinnedPostId,'post0');
    await dispatch(db,b,'like',{postId:'post0',enabled:true});
    const pinned=await dispatch(db,b,'page',{options:{mode:'profilePin',profileId:a.uid}});
    assert.equal(pinned.items[0].id,'post0');assert.equal(pinned.items[0].author,'New Alice');assert.equal(pinned.items[0].liked,true);assert.equal(pinned.items[0].likeCount,1);
    const home=await dispatch(db,a,'page',{options:{mode:'posts',category:'최신'}});
    assert.equal(home.items[0].id,'post24');assert.equal(home.items.some(p=>p.id==='post0'),false);
    await dispatch(db,a,'pinProfilePost',{id:'post1',enabled:true});
    await dispatch(db,a,'pinProfilePost',{id:'post0',enabled:false});
    assert.equal((await dispatch(db,null,'profile',{id:a.uid})).pinnedPostId,'post1');
    await dispatch(db,a,'pinProfilePost',{id:'post1',enabled:false});
    assert.deepEqual((await dispatch(db,a,'page',{options:{mode:'profilePin',profileId:a.uid}})).items,[]);
    await dispatch(db,a,'pinProfilePost',{id:'post1',enabled:true});
    await dispatch(db,a,'deletePost',{id:'post1'});
    assert.equal((await dispatch(db,null,'profile',{id:a.uid})).pinnedPostId,undefined);
    const repost=await dispatch(db,b,'repost',{postId:'post2',enabled:true,comment:'Shared'});
    await dispatch(db,b,'pinProfilePost',{id:repost.id,enabled:true});
    assert.equal((await dispatch(db,b,'page',{options:{mode:'profilePin',profileId:b.uid,feed:'reposts'}})).items[0].repostProfile.username,'Bob');
    await dispatch(db,a,'deletePost',{id:'post2'});
    assert.equal((await dispatch(db,null,'profile',{id:b.uid})).pinnedRepostId,undefined);
  }finally{await pg.close();}
});

test('authored and repost pins are independent, typed, protected and migrate existing repost pins',async()=>{
  const {pg,db}=await communityHarness();try{
    const a={uid:'a',name:'Alice'},b={uid:'b',name:'Bob'};
    for(const user of [a,b])await dispatch(db,user,'ensureProfile');
    for(const [id,owner] of [['own','a'],['other','b'],['second','b']])await db.put({kind:'posts',id,parent:'',owner,body:{authorId:owner,coin:'SL',content:id,createdAt:1,support:0,oppose:0}});
    const repost=await dispatch(db,a,'repost',{postId:'other',enabled:true});
    await dispatch(db,a,'pinProfilePost',{id:'own',enabled:true});
    await dispatch(db,a,'pinProfilePost',{id:repost.id,enabled:true});
    const profile=await dispatch(db,null,'profile',{id:a.uid});
    assert.equal(profile.pinnedPostId,'own');assert.equal(profile.pinnedRepostId,repost.id);
    for(const [feed,id] of [['posts','own'],['reposts',repost.id]]){
      const page=await dispatch(db,b,'page',{options:{mode:'profilePin',profileId:a.uid,feed}});
      assert.deepEqual(page.items.map(p=>p.id),[id]);
    }
    await db.mutate('updateProfile','a','',{username:'Updated',pinnedPostId:'other',pinnedRepostId:'other'});
    assert.equal((await dispatch(db,null,'profile',{id:'a'})).pinnedRepostId,repost.id);
    const second=await dispatch(db,a,'repost',{postId:'second',enabled:true});
    await dispatch(db,a,'pinProfilePost',{id:second.id,enabled:true});
    await dispatch(db,a,'pinProfilePost',{id:repost.id,enabled:false});
    assert.equal((await dispatch(db,null,'profile',{id:'a'})).pinnedRepostId,second.id);
    await dispatch(db,a,'repost',{postId:'second',enabled:false});
    assert.equal((await dispatch(db,null,'profile',{id:'a'})).pinnedPostId,'own');
    assert.equal((await dispatch(db,null,'profile',{id:'a'})).pinnedRepostId,undefined);
    await dispatch(db,a,'pinProfilePost',{id:repost.id,enabled:true});
    await dispatch(db,a,'deletePost',{id:'own'});
    assert.equal((await dispatch(db,null,'profile',{id:'a'})).pinnedRepostId,repost.id);
    await pg.query("update korae_documents set body=(body-'pinnedRepostId')||jsonb_build_object('pinnedPostId',$1::text) where kind='profiles' and id='a'",[repost.id]);
    const {readFile}=await import('node:fs/promises');
    const migration=await readFile(new URL('../supabase/migrations/202609300006_separate_profile_pins.sql',import.meta.url),'utf8');
    await pg.exec(migration);await pg.exec(migration);
    const migrated=await dispatch(db,null,'profile',{id:'a'});
    assert.equal(migrated.pinnedPostId,undefined);assert.equal(migrated.pinnedRepostId,repost.id);
    await assert.rejects(dispatch(db,a,'page',{options:{mode:'profilePin',profileId:'a',feed:'invalid'}}));
  }finally{await pg.close();}
});
