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
    assert.equal((await dispatch(db,b,'page',{options:{mode:'profilePin',profileId:b.uid}})).items[0].repostProfile.username,'Bob');
    await dispatch(db,a,'deletePost',{id:'post2'});
    assert.equal((await dispatch(db,null,'profile',{id:b.uid})).pinnedPostId,undefined);
  }finally{await pg.close();}
});
