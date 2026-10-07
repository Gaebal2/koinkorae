import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {communityHarness} from './community-harness.js';
test('50 member limit preserves existing users, rejects extra accounts and blocks maintenance writes',async()=>{
 const {pg,db}=await communityHarness();
 try {
 await db.put({kind:'profiles',id:'operator',parent:'',owner:'operator',body:{username:'Admin',role:'admin',profileImage:'keep'}});
 await pg.exec(await readFile(new URL('../supabase/migrations/202610070002_trial_members.sql',import.meta.url),'utf8'));
 const admit=(id)=>pg.query('select korae_admit($1,$2)',[id,'New']);
 await admit('operator');
 for(let n=1;n<49;n++)await admit('member'+n);
 const results=await Promise.allSettled([admit('last-a'),admit('last-b')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.match(results.find(r=>r.status==='rejected').reason.message,/capacity/);
 assert.equal((await pg.query('select member_count from korae_trial_settings')).rows[0].member_count,50);
 await admit('operator');assert.equal((await db.one('profiles','operator')).body.role,'admin');
 await assert.rejects(db.put({kind:'profiles',id:'bypass',parent:'',owner:'bypass',body:{}}),/membership/);
 await pg.exec('update korae_trial_settings set maintenance=true');
 await assert.rejects(admit('operator'),/maintenance/);
 await assert.rejects(db.put({kind:'posts',id:'p',parent:'',owner:'operator',body:{}}),/maintenance/);
 await pg.exec("begin;set local korae.reset='on';delete from korae_documents where kind<>'profiles';commit;");
 assert.equal((await db.one('profiles','operator')).body.profileImage,'keep');
 }finally{await pg.close();}
});
