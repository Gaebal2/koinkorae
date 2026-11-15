import {createECDH,randomBytes} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const directory=resolve('.runtime/notifications');
await mkdir(directory,{recursive:true});
const secretPath=resolve(directory,'secrets.env');
let values;
try{values=Object.fromEntries((await readFile(secretPath,'utf8')).trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));}
catch(error){if(error.code!=='ENOENT')throw error;const curve=createECDH('prime256v1');curve.generateKeys();values={WEB_PUSH_PUBLIC_KEY:curve.getPublicKey().toString('base64url'),WEB_PUSH_PRIVATE_KEY:curve.getPrivateKey().toString('base64url'),WEB_PUSH_SUBJECT:'https://koinkorae.com',PUSH_DISPATCH_SECRET:randomBytes(32).toString('base64url')};await writeFile(secretPath,Object.entries(values).map(([key,value])=>key+'='+value).join('\n')+'\n',{flag:'wx'});}
// Keep the original keys for existing push subscriptions, but isolate their names
// from PSL_Mining's WEB_PUSH_* secrets in the shared Supabase project.
values=Object.fromEntries(Object.entries(values).map(([key,value])=>[key.startsWith('KORAE_')?key:'KORAE_'+key,value]));
await writeFile(resolve(directory,'korae-secrets.env'),Object.entries(values).map(([key,value])=>key+'='+value).join('\n')+'\n');
const project='https://xvqbsiqeoxbkxsvxgnvc.supabase.co';
const literal=value=>"'"+value.replaceAll("'","''")+"'";
await writeFile(resolve(directory,'vault.sql'),`-- Private deployment input; never commit this file.
do $$ declare existing uuid; begin
 select id into existing from vault.secrets where name='korae_project_url';
 if existing is null then perform vault.create_secret(${literal(project)},'korae_project_url');
 else perform vault.update_secret(existing,${literal(project)});end if;
 select id into existing from vault.secrets where name='korae_push_dispatch_secret';
 if existing is null then perform vault.create_secret(${literal(values.KORAE_PUSH_DISPATCH_SECRET)},'korae_push_dispatch_secret');
 else perform vault.update_secret(existing,${literal(values.KORAE_PUSH_DISPATCH_SECRET)});end if;
end $$;
`);
console.log('Private inputs prepared in .runtime/notifications (existing VAPID keys preserved).');
console.log('1. Read docs/shared-supabase.md. Existing notification schema must not be replayed.');
console.log('2. supabase secrets set --env-file .runtime/notifications/korae-secrets.env --project-ref xvqbsiqeoxbkxsvxgnvc');
console.log('3. supabase functions deploy community --project-ref xvqbsiqeoxbkxsvxgnvc');
console.log('4. supabase functions deploy push-dispatch --project-ref xvqbsiqeoxbkxsvxgnvc');
console.log('5. Apply .runtime/notifications/vault.sql, then supabase/notifications-schedule.sql in SQL Editor.');
console.log('6. Deploy the frontend; opt in on a test device and verify real delivery.');
