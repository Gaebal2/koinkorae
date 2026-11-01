// No scheduled jobs, paid APIs or transfers are created by this utility.
import {readFile,writeFile} from 'node:fs/promises';
import {allocateSnapshot,EVENT_ID} from '../supabase/functions/_shared/swithpi.js';
const [command,...args]=process.argv.slice(2);
async function api(path,body) {
 const {SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key}=process.env;
 if(!url||!key)throw Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the process environment.');
 if(!url.startsWith('https://'))throw Error('HTTPS is required');
 const response=await fetch(url+'/rest/v1/'+path,{method:body?'POST':'GET',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('Snapshot API failed with status '+response.status);
 return response.json();
}
try {
 if(command==='export'&&args.length===1){
  const rows=[];for(let offset=0;;offset+=500){
   const page=await api(`korae_airdrop_entries?event_id=eq.${EVENT_ID}&select=sequence,pi_address,psl_address,applied_at&order=sequence&limit=500&offset=${offset}`);
   if(page.some(r=>!Number.isSafeInteger(r.sequence)))throw Error('Sequence exceeds JSON safe integer limit');
   rows.push(...page.map(r=>({...r,sequence:String(r.sequence)})));if(page.length<500)break;
  }
  await writeFile(args[0],JSON.stringify(rows,null,2),{flag:'wx'});console.log('Exported '+rows.length+' applicants.');
 }else if(command==='prepare'&&args.length===3){
  const [entries,snapshot]=await Promise.all(args.slice(0,2).map(path=>readFile(path,'utf8').then(JSON.parse)));
  const allocations=allocateSnapshot(entries,snapshot);
  await writeFile(args[2],JSON.stringify({...snapshot,allocations},null,2),{flag:'wx'});
  console.log('Prepared '+allocations.length+' allocations for review; no server data changed.');
 }else if(command==='finalize'&&args.length===1){
  const snapshot=JSON.parse(await readFile(args[0],'utf8'));
  const verified=allocateSnapshot(snapshot.allocations,snapshot);
  if(verified.some((row,i)=>row.amount!==snapshot.allocations[i].amount||row.balance!==snapshot.allocations[i].balance))throw Error('Allocation evidence was modified');
  const result=await api('rpc/korae_finalize_psl_snapshot',{p_snapshot:snapshot});console.log(JSON.stringify(result));
 }else throw Error('Usage: node scripts/psl-snapshot.mjs export <new-entries.json> | prepare <entries.json> <historical-snapshot.json> <new-review.json> | finalize <review.json>');
}catch(error){console.error(error.message);process.exitCode=1;}
