// Run with an existing Supabase CLI login. Credentials stay in process memory.
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
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
async function rows(){
 const all=[];
 for(let offset=0;;offset+=100){const page=await (await request('/rest/v1/korae_documents?select=kind,id,parent,owner,body&kind=in.(profiles,pins,posts)&order=kind,parent,id&limit=100&offset='+offset)).json();all.push(...page);if(page.length<100)return all;}
}
const data=await rows();
const fields=['image','additionalImage','profileImage'];
const inline=data.flatMap(row=>fields.filter(field=>row.body[field]?.startsWith('data:image/')).map(field=>({row,field})));
console.log(JSON.stringify({records:data.length,inlinePhotos:inline.length,inlineBytes:inline.reduce((n,{row,field})=>n+Buffer.byteLength(row.body[field]),0)}));
if(process.argv.includes('--prepare')){
 const found=await fetch(baseUrl+'/storage/v1/bucket/'+MEDIA_BUCKET,{headers});
 const desired={id:MEDIA_BUCKET,name:MEDIA_BUCKET,public:true,file_size_limit:225000,allowed_mime_types:['image/jpeg','image/png','image/webp']};
 if(found.ok){const b=await found.json();if(!b.public||b.file_size_limit!==225000)throw Error('Existing bucket configuration differs; inspect before changing it');}
 else if(found.status===400||found.status===404)await request('/storage/v1/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(desired)});
 else throw Error('Bucket inspection failed '+found.status);
 console.log('Public photo bucket ready; uploads remain server-only.');
}
if(process.argv.includes('--migrate')){
 const directory='.runtime/media-migration';await mkdir(directory,{recursive:true});
 const backup=directory+'/before-'+Date.now()+'.json';await writeFile(backup,JSON.stringify(data));
 console.log('Backup saved: '+backup);
 const store=createPhotoStore({baseUrl,upload:async(key,bytes,options)=>{
   const r=await fetch(baseUrl+'/storage/v1/object/'+MEDIA_BUCKET+'/'+key,{method:'POST',headers:{...headers,'Content-Type':options.contentType,'Cache-Control':'max-age='+options.cacheControl,'x-upsert':'false'},body:bytes,signal:AbortSignal.timeout(60000)});
   if(!r.ok){const e=await r.json();if(e.error!=='Duplicate'&&String(e.statusCode)!=='409')throw Error('Photo upload failed '+r.status);}
   const read=await fetch(baseUrl+'/storage/v1/object/public/'+MEDIA_BUCKET+'/'+key,{signal:AbortSignal.timeout(60000)});
   if(!read.ok)throw Error('Uploaded photo not readable');
   const downloaded=Buffer.from(await read.arrayBuffer());
   if(createHash('sha256').update(downloaded).digest('hex')!==createHash('sha256').update(bytes).digest('hex'))throw Error('Photo verification failed');
 }});
 let migrated=0,concurrentEdits=0;
 for(const {row,field} of inline){
   const url=await store(row.body[field]);
   const changed=await (await request('/rest/v1/rpc/korae_move_photo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_kind:row.kind,p_id:row.id,p_parent:row.parent,p_field:field,p_expected:row.body[field],p_url:url})})).json();
   if(changed)migrated++;else concurrentEdits++;
 }
 const after=await rows();const remaining=after.flatMap(row=>fields.filter(field=>row.body[field]?.startsWith('data:image/'))).length;
 console.log(JSON.stringify({migrated,concurrentEdits,remainingInlinePhotos:remaining,beforeJsonBytes:Buffer.byteLength(JSON.stringify(data)),afterJsonBytes:Buffer.byteLength(JSON.stringify(after))}));
}
