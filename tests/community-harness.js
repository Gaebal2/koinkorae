import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export async function communityHarness() {
  const pg=new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  for(const file of ['202609280001_community.sql','202609290001_chat_and_battle_progress.sql'])await pg.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const db={
    async one(kind,id,parent=''){return (await pg.query('select * from korae_documents where kind=$1 and id=$2 and parent=$3',[kind,id,parent])).rows[0]||null;},
    async list(kind,f={}){return (await pg.query(`select * from korae_documents where kind=$1 and ($2::text is null or owner=$2) and ($3::text is null or parent=$3) and ($4::bigint is null or (body->>'createdAt')::bigint<$4) order by (body->>'createdAt')::bigint ${f.oldest?'asc':'desc'} nulls last,id limit $5`,[kind,f.owner||null,f.parent||null,f.before??null,f.limit??100000])).rows;},
    async count(kind,parent){return +(await pg.query('select count(*) as n from korae_documents where kind=$1 and parent=$2',[kind,parent])).rows[0].n;},
    async put(row,ignore=false){await pg.query(`insert into korae_documents values($1,$2,$3,$4,$5) on conflict(kind,parent,id) do ${ignore?'nothing':'update set body=excluded.body'}`,[row.kind,row.id,row.parent,row.owner,JSON.stringify(row.body)]);},
    async remove(kind,id,parent,owner){await pg.query('delete from korae_documents where kind=$1 and id=$2 and parent=$3 and owner=$4',[kind,id,parent,owner]);},
    async mutate(action,uid,id,value){return (await pg.query('select korae_mutate($1,$2,$3,$4) as result',[action,uid,id,JSON.stringify(value)])).rows[0].result;},
  };
  return {pg,db};
}
