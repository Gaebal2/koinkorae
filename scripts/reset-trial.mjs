// Run with an existing Supabase CLI login. Credentials stay in process memory.
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPhotoStore,MEDIA_BUCKET} from '../supabase/functions/community/media.js';
const project='cxvznpfcmorysnwwmbna',baseUrl=`https://${project}.supabase.co`;
const args=['--yes','supabase','projects','api-keys','--project-ref',project,'--reveal','--output','json'];
const raw=process.platform==='win32'?execFileSync('cmd.exe',['/d','/s','/c','npx.cmd '+args.join(' ')],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}):execFileSync('npx',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const secret=JSON.parse(raw).find(x=>x.name==='service_role')?.api_key;
if(!secret)throw Error('Supabase service credential unavailable');
const headers={apikey:secret,Authorization:'Bearer '+secret};
async function request(path,options={}){
 const response=await fetch(baseUrl+path,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error(`Supabase request failed (${response.status}) at ${path.split('?')[0]}`);
 return response;
}

const directory='.runtime/service-reset';
const tables=['korae_documents','korae_battle_totals','korae_battle_contributors','korae_feed_battle_activity','korae_trial_members','korae_trial_settings'];
async function all(table){const rows=[];for(let offset=0;;offset+=500){const batch=await (await request('/rest/v1/'+table+'?select=*&limit=500&offset='+offset)).json();rows.push(...batch);if(batch.length<500)return rows;}}
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const accounts=JSON.parse(await readFile(directory+'/accounts.json','utf8'));
if(process.argv.includes('--backup')){
 for(const account of accounts)await request('/rest/v1/rpc/korae_admit',json('POST',{p_uid:account.uid,p_name:account.name}));
 await request('/rest/v1/korae_trial_settings?id=eq.1',json('PATCH',{maintenance:true}));
 const backup={createdAt:new Date().toISOString(),accounts,tables:{},objects:[]};
 for(const table of tables)backup.tables[table]=await all(table);
 await mkdir(directory+'/photos',{recursive:true});
 for(let offset=0;;offset+=100){const batch=await (await request('/storage/v1/object/list/community-media',json('POST',{prefix:'',limit:100,offset,sortBy:{column:'name',order:'asc'}}))).json();
 for(const object of batch){if(!object.id||!/^([a-f0-9]{64})\.(jpeg|png|webp)$/.test(object.name))throw Error('Unexpected storage object; review before reset');
 const bytes=Buffer.from(await (await request('/storage/v1/object/community-media/'+object.name)).arrayBuffer());
 const digest=createHash('sha256').update(bytes).digest('hex');if(digest!==object.name.split('.')[0])throw Error('Photo integrity check failed');
 await writeFile(directory+'/photos/'+object.name,bytes);backup.objects.push({...object,sha256:digest});}
 if(batch.length<100)break;}
 await writeFile(directory+'/backup.json',JSON.stringify(backup));
 console.log(JSON.stringify({backup:directory+'/backup.json',counts:Object.fromEntries(tables.map(t=>[t,backup.tables[t].length])),photos:backup.objects.length,maintenance:true}));
}
if(process.argv.includes('--reset')){
 const backup=JSON.parse(await readFile(directory+'/backup.json','utf8'));
 const settings=await all('korae_trial_settings');if(!settings[0].maintenance)throw Error('Maintenance required');
 const docs=await all('korae_documents');const canonical=rows=>JSON.stringify([...rows].sort((a,b)=>(a.kind+a.parent+a.id).localeCompare(b.kind+b.parent+b.id)));
 if(canonical(docs)!==canonical(backup.tables.korae_documents))throw Error('Data changed after backup');
 const sql="begin;set local korae.reset='on';delete from public.korae_documents where kind<>'profiles';delete from public.korae_battle_contributors;delete from public.korae_battle_totals;delete from public.korae_feed_battle_activity;update public.korae_documents set body=body-'pinnedPostId'-'pinnedRepostId' where kind='profiles';commit;";
 await writeFile(directory+'/reset.sql',sql);
 execFileSync('cmd.exe',['/d','/s','/c','npx.cmd --yes supabase db query --linked --project-ref '+project+' --file '+directory+'/reset.sql'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 const preserved=new Set(docs.filter(r=>r.kind==='profiles').map(r=>r.body.profileImage?.split('/community-media/')[1]).filter(Boolean));
 const remove=backup.objects.filter(o=>!preserved.has(o.name));
 for(let i=0;i<remove.length;i+=100)await request('/storage/v1/object/community-media',json('DELETE',{prefixes:remove.slice(i,i+100).map(o=>o.name)}));
 const after=await all('korae_documents');if(after.some(r=>r.kind!=='profiles'))throw Error('Activity rows remain');
 const expected=docs.filter(r=>r.kind==='profiles').map(r=>({...r,body:Object.fromEntries(Object.entries(r.body).filter(([k])=>!['pinnedPostId','pinnedRepostId'].includes(k)))}));
 if(canonical(after)!==canonical(expected))throw Error('Profile preservation check failed');
 for(const table of tables.slice(1,4))if((await all(table)).length)throw Error('Aggregate rows remain');
 await writeFile(directory+'/result.json',JSON.stringify({profiles:after.length,removedRecords:docs.length-after.length,removedPhotos:remove.length,retainedPhotos:preserved.size}));
 console.log(await readFile(directory+'/result.json','utf8'));
}
if(process.argv.includes('--resume')){await request('/rest/v1/korae_trial_settings?id=eq.1',json('PATCH',{maintenance:false}));console.log(JSON.stringify((await all('korae_trial_settings'))[0]));}
