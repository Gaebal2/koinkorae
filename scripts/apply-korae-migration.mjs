// Separate migration ledger: Supabase's standard ledger belongs to PSL_Mining.
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {resolve,basename,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const project='xvqbsiqeoxbkxsvxgnvc';
const file=resolve(process.argv[2]||'');
const version=basename(file).match(/^(\d{12,})_[a-z0-9_]+\.sql$/)?.[1];
if(!version||relative(resolve('supabase/migrations'),file).startsWith('..')||version<='202611030001')throw Error('Choose a new koinkorae migration under supabase/migrations; historical SQL must not be replayed.');
const source=await readFile(file,'utf8');
if(/\b(?:drop|alter|create)\s+(?:schema|role|publication|extension)\b|\balter\s+default\s+privileges\b|\b(?:auth|mining_private|supabase_migrations|storage|vault|cron)\s*\./i.test(source))throw Error('Shared/global infrastructure changes need separate review, not an application migration.');
for(const match of source.matchAll(/\bpublic\.([a-zA-Z_][a-zA-Z0-9_]*)/g))if(!match[1].startsWith('korae_'))throw Error('Migration references another application: '+match[0]);
const hash=createHash('sha256').update(source).digest('hex');
const sql=`begin;
select pg_advisory_xact_lock(hashtextextended('korae_schema_migrations',0));
create table if not exists public.korae_schema_migrations(version text primary key,checksum text not null,applied_at timestamptz not null default now());
alter table public.korae_schema_migrations enable row level security;
revoke all on public.korae_schema_migrations from public,anon,authenticated;
do $guard$ begin if exists(select 1 from public.korae_schema_migrations where version='${version}') then raise exception 'Migration already recorded; inspect checksum rather than replaying'; end if; end $guard$;
${source}
insert into public.korae_schema_migrations(version,checksum) values('${version}','${hash}');
commit;`;
await mkdir('.runtime/korae-migrations',{recursive:true});
const input=resolve('.runtime/korae-migrations/'+randomUUID()+'.sql');
try{
 await writeFile(input,sql);
 const cli=process.env.SUPABASE_CLI||'supabase';
 execFileSync(cli,['db','query','--linked','--project-ref',project,'--file',input],{stdio:'inherit',windowsHide:true});
 console.log('Recorded koinkorae migration '+version+'; PSL migration history unchanged.');
}finally{await unlink(input).catch(()=>{});}
