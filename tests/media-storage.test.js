import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoStore} from '../supabase/functions/community/media.js';
import {dispatch} from '../supabase/functions/community/handler.js';

const sample='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=';
test('photos become immutable URLs; edits preserve URLs and untrusted URLs are rejected',async()=>{
  const uploads=[];
  const store=createPhotoStore({baseUrl:'https://media.test',upload:async(...args)=>uploads.push(args)});
  const url=await store(sample);
  assert.match(url,/^https:\/\/media.test\/storage\/v1\/object\/public\/community-media\/[a-f0-9]{64}\.png$/);
  assert.equal(uploads[0][1].length,68);
  assert.deepEqual(uploads[0][2],{contentType:'image/png',cacheControl:'31536000',upsert:false});
  assert.equal(await store(url),url);assert.equal(uploads.length,1);
  assert.equal(await store(sample),url);
  assert.equal(await store(''),'');
  for(const bad of ['https://evil.test/a.png',url+'?x=1',url.replace('media.test','media.test.evil'),url.replace(/[^/]+$/,'../bad.png'),'data:image/svg+xml;base64,AAAA','data:image/png;base64,'+'A'.repeat(300000)])await assert.rejects(store(bad));
  const failed=createPhotoStore({baseUrl:'https://media.test',upload:async()=>{throw Error('storage unavailable');}});
  await assert.rejects(failed(sample),/storage unavailable/);
});
test('writes save URLs only after successful upload, and unauthenticated requests cannot upload',async()=>{
  const rows=[],uploads=[];
  const db={one:async()=>null,put:async row=>rows.push(row),mutate:async(action,uid,id,value)=>rows.push({action,value}),storePhoto:createPhotoStore({baseUrl:'https://media.test',upload:async(...args)=>uploads.push(args)})};
  await assert.rejects(dispatch(db,null,'publish',{value:{content:'hello',coin:'PI',image:sample}}));
  assert.equal(uploads.length,0);
  const user={uid:'alice',name:'Alice'};
  await dispatch(db,user,'publish',{value:{content:'hello',coin:'PI',image:sample,additionalImage:sample}});
  assert.ok(rows[0].body.image.startsWith('https://media.test/'));assert.equal(rows[0].body.image,rows[0].body.additionalImage);
  await dispatch(db,user,'saveProfile',{value:{bio:'',profileImage:rows[0].body.image}});
  assert.equal(rows[1].value.profileImage,rows[0].body.image);
  await assert.rejects(dispatch(db,user,'savePin',{id:'not-mine',value:{title:'Pin',description:'test',coin:'PI',tradeCoins:[],category:'상점',lat:0,lng:0,image:sample}}),/수정/);
  assert.equal(uploads.length,2);
  db.storePhoto=async()=>{throw Error('storage unavailable');};
  await assert.rejects(dispatch(db,user,'publish',{value:{content:'hello',coin:'PI',image:sample}}),/storage unavailable/);
  assert.equal(rows.length,2);
});
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('photo migration preserves concurrent edits and is unavailable to browser roles',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  await pg.exec(await readFile('supabase/migrations/202609280001_community.sql','utf8'));
  await pg.exec(await readFile('supabase/migrations/202610070001_media_storage.sql','utf8'));
  const url='https://cxvznpfcmorysnwwmbna.supabase.co/storage/v1/object/public/community-media/'+'a'.repeat(64)+'.png';
  await pg.query('insert into korae_documents values($1,$2,$3,$4,$5)',['posts','post','','alice',JSON.stringify({image:sample,content:'keep'})]);
  const move=expected=>pg.query('select korae_move_photo($1,$2,$3,$4,$5,$6) as moved',['posts','post','','image',expected,url]);
  assert.equal((await move(sample+'changed')).rows[0].moved,false);
  assert.equal((await move(sample)).rows[0].moved,true);
  assert.equal((await move(sample)).rows[0].moved,false);
  assert.deepEqual((await pg.query('select body from korae_documents')).rows[0].body,{image:url,content:'keep'});
  for(const role of ['anon','authenticated']){await pg.exec('set role '+role);await assert.rejects(move(sample),/permission denied/);await pg.exec('reset role');}
 }finally{await pg.close();}
});
