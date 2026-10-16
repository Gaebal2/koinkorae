import {createClient} from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import {notificationPayload, subscription} from '../community/notifications.js';

const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
async function rpc(name:string,args:any={}){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
Deno.serve(async request=>{
 const secret=Deno.env.get('PUSH_DISPATCH_SECRET');
 if(!secret || request.headers.get('Authorization')!=='Bearer '+secret)return new Response('Unauthorized',{status:401});
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 const publicKey=Deno.env.get('WEB_PUSH_PUBLIC_KEY'),privateKey=Deno.env.get('WEB_PUSH_PRIVATE_KEY'),subject=Deno.env.get('WEB_PUSH_SUBJECT');
 if(!publicKey||!privateKey||!subject)return new Response('Push configuration unavailable',{status:503});
 try {
  await rpc('korae_queue_due_checkins');
  const jobs=await rpc('korae_claim_push',{p_limit:50});
  // Bound concurrency and network timeouts; a failed process leaves a recoverable lease.
  for(let offset=0;offset<jobs.length;offset+=10)await Promise.all(jobs.slice(offset,offset+10).map(async(job:any)=>{
   let status=503;
   try {
    const result=await webpush.sendNotification(subscription(job.subscription),JSON.stringify(notificationPayload(job)),{
     vapidDetails:{subject,publicKey,privateKey},TTL:3600,urgency:'normal',timeout:10000,
    });
    status=result.statusCode;
   }catch(error:any){status=error.statusCode||503;}
   await rpc('korae_finish_push',{p_id:job.id,p_lease:job.lease,p_status:status});
  }));
  return Response.json({processed:jobs.length});
 }catch {return new Response('Push delivery failed',{status:500});}
});
