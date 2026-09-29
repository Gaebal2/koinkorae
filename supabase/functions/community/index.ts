import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { dispatch, publicActions } from './handler.js';

const project = Deno.env.get('FIREBASE_PROJECT_ID') || 'koinkorae-map';
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{persistSession:false,autoRefreshToken:false}});
const table = () => client.from('korae_documents');
async function result(query: any) { const {data,error}=await query; if(error) throw Error(error.message); return data; }
const db = {
  one: (kind:string,id:string,parent='') => result(table().select('*').eq('kind',kind).eq('id',id).eq('parent',parent).maybeSingle()),
  async list(kind:string,filter:any={}) {
    const rows:any[]=[];
    for(let offset=0;;offset+=500) {
      let query=table().select('*').eq('kind',kind);
      if(filter.owner) query=query.eq('owner',filter.owner);
      if(filter.parent) query=query.eq('parent',filter.parent);
      if(filter.before !== undefined) query=query.lt('body->createdAt',filter.before);
      if(filter.recent || filter.oldest) query=query.order('body->createdAt',{ascending:!!filter.oldest});
      query=query.order('parent').order('id');
      const size=filter.limit ? Math.min(500,filter.limit-offset) : 500;
      const batch=await result(query.range(offset,offset+size-1)); rows.push(...batch);
      if(batch.length<size || (filter.limit && rows.length>=filter.limit)) return rows;
    }
  },
  async count(kind:string,parent:string) { const {count,error}=await table().select('*',{head:true,count:'exact'}).eq('kind',kind).eq('parent',parent); if(error) throw error; return count; },
  put: (row:any,ignore=false) => result(table().upsert(row,{onConflict:'kind,parent,id',ignoreDuplicates:ignore})),
  remove: (kind:string,id:string,parent:string,owner:string) => result(table().delete().eq('kind',kind).eq('id',id).eq('parent',parent).eq('owner',owner)),
  mutate: (action:string,uid:string,id:string,value:any) => result(client.rpc('korae_mutate',{p_action:action,p_uid:uid,p_id:id,p_value:value})),
};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
Deno.serve(async request=>{
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
  if(request.method!=='POST') return reply({error:'POST 요청이 필요합니다.'},405);
  try {
    const raw=await request.text();
    if(raw.length>400000) return reply({error:'요청이 너무 큽니다.'},413);
    const {action,args={}}=JSON.parse(raw);
    if(typeof action!=='string' || !args || typeof args!=='object' || Array.isArray(args)) return reply({error:'잘못된 요청입니다.'},400);
    let identity=null;
    const header=request.headers.get('Authorization');
    if(header) {
      try {
        if(!header.startsWith('Bearer ')) throw Error('token');
        const {payload}=await jwtVerify(header.slice(7),jwks,{algorithms:['RS256'],issuer:`https://securetoken.google.com/${project}`,audience:project,requiredClaims:['exp','iat','sub','auth_time']});
        if(!payload.sub || payload.sub.length>128 || !payload.iat || payload.iat>Date.now()/1000 || typeof payload.auth_time!=='number' || payload.auth_time>Date.now()/1000) throw Error('claims');
        identity={uid:payload.sub,name:typeof payload.name==='string'?payload.name:'회원'};
      } catch { return reply({error:'로그인이 만료되었습니다. 다시 로그인해 주세요.'},401); }
    }
    if(!identity && !publicActions.has(action)) return reply({error:'로그인이 필요합니다.'},401);
    return reply({data:await dispatch(db,identity,action,args)});
  } catch(error:any) {
    return reply({error:error.message || '요청을 처리하지 못했습니다.'},error.status || 400);
  }
});
