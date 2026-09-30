import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cropGeometry,validatePhotoFile} from '../src/photo-editing.js';
import {communityHarness} from './community-harness.js';
import {dispatch} from '../supabase/functions/community/handler.js';

test('photo crop stays within the source, preserves ratio, supports zoom and position, and limits output size',()=>{
  assert.deepEqual(cropGeometry(4000,3000,4/3),{sx:0,sy:0,sw:4000,sh:3000,width:960,height:720});
  const square=cropGeometry(4000,3000,1,2,100,0,512);
  assert.deepEqual(square,{sx:2500,sy:0,sw:1500,sh:1500,width:512,height:512});
  for(const ratio of [1,3/4,4/3,16/9])for(const zoom of [1,2,4])for(const position of [-10,0,50,100,110]){
    const g=cropGeometry(1200,3000,ratio,zoom,position,position);
    assert.ok(g.sx>=0&&g.sy>=0&&g.sx+g.sw<=1200.00001&&g.sy+g.sh<=3000.00001);
    assert.ok(Math.max(g.width,g.height)<=960);assert.ok(Math.abs(g.sw/g.sh-ratio)<1e-8);
  }
  assert.doesNotThrow(()=>validatePhotoFile({type:'image/jpeg',size:15*1024*1024}));
  assert.throws(()=>validatePhotoFile({type:'image/jpeg',size:21*1024*1024}));
  assert.throws(()=>validatePhotoFile({type:'image/svg+xml',size:20}));
});

test('practice capture, edited extra photo and attached pin survive publish and repost without adding battle points',async()=>{
  const {pg,db}=await communityHarness();try{
    const user={uid:'photo-test',name:'Photo'};
    const pin=await dispatch(db,user,'savePin',{value:{title:'Shop',description:'Photo test',coin:'SL',category:'상점 등록',tradeCoins:['SL'],image:'',link:'',lat:0,lng:0}});
    const image='data:image/jpeg;base64,AAAA',additionalImage='data:image/jpeg;base64,BBBB';
    await dispatch(db,user,'publish',{value:{coin:'SL',content:'Practice result',image,additionalImage,pinId:pin.id}});
    const post=(await dispatch(db,null,'posts'))[0];
    assert.equal(post.image,image);assert.equal(post.additionalImage,additionalImage);assert.equal(post.pinId,pin.id);
    assert.equal(post.support,0);assert.equal(post.oppose,0);
    const repost=await dispatch(db,user,'repost',{postId:post.id,enabled:true});const saved=(await db.one('posts',repost.id)).body;
    assert.equal(saved.image,image);assert.equal(saved.additionalImage,additionalImage);assert.equal(saved.pinId,pin.id);
    for(const bad of ['https://example.com/a.png','data:image/jpeg;base64,'+'A'.repeat(300000)])await assert.rejects(dispatch(db,user,'publish',{value:{coin:'SL',content:'bad',image,additionalImage:bad}}));
  }finally{await pg.close();}
});

test('iOS startup links resolve to matching images, including mini devices, and a standalone startup fallback exists',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const links=[...html.matchAll(/rel="apple-touch-startup-image" href="%BASE_URL%(ios-splash\/launch-v7-(\d+)x(\d+)\.png)" media="([^"]+)"/g)];
  assert.ok(links.length>=48);assert.ok(html.includes('device-width: 360px'));assert.ok(html.includes('device-width: 744px'));
  for(const [,file,width,height,media] of links){
    const bytes=await readFile(new URL('../public/'+file,import.meta.url));assert.equal(bytes.readUInt32BE(16),+width);assert.equal(bytes.readUInt32BE(20),+height);
    assert.ok(html.includes(`rel="preload" as="image" href="%BASE_URL%${file}" media="${media}"`));
  }
  assert.ok(html.includes('navigator.standalone'));assert.ok(html.includes('class="app-launch"'));
  // React must not erase the startup artwork before the first app frame.
  assert.match(html,/<\/div><div id="root"><\/div>/);
  assert.ok(!/<div id="root">\s*<div class="app-launch"/.test(html));
});
