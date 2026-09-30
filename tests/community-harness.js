import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export async function communityHarness() {
  const pg=new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  await pg.exec("create schema realtime; create table realtime.test_events(payload jsonb,event text,topic text,private boolean); create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$ insert into realtime.test_events values(payload,event,topic,private); $$;");
  for(const file of ['202609280001_community.sql','202609290001_chat_and_battle_progress.sql','202609300001_read_optimization.sql','202609300002_likes_and_trade_coins.sql'])await pg.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const db={
    async one(kind,id,parent=''){return (await pg.query('select * from korae_documents where kind=$1 and id=$2 and parent=$3',[kind,id,parent])).rows[0]||null;},
    async many(kind,ids){return (await pg.query('select id,body from korae_documents where kind=$1 and parent=\'\' and id=any($2::text[])',[kind,ids])).rows;},
    async page(uid,options,cursor,limit){return (await pg.query('select korae_page($1,$2,$3,$4) as result',[uid,JSON.stringify(options),cursor===null?null:JSON.stringify(cursor),limit])).rows[0].result;},
    async friends(uid){return (await pg.query('select korae_friends($1) as result',[uid])).rows[0].result;},
    async counts(ids){return (await pg.query('select korae_comment_counts($1) as result',[ids])).rows[0].result;},
    async list(kind,f={}){return (await pg.query(`select * from korae_documents where kind=$1 and ($2::text is null or owner=$2) and ($3::text is null or parent=$3) and ($4::bigint is null or (body->>'createdAt')::bigint<$4) order by (body->>'createdAt')::bigint ${f.oldest?'asc':'desc'} nulls last,id limit $5`,[kind,f.owner||null,f.parent||null,f.before??null,f.limit??100000])).rows;},
    async count(kind,parent){return +(await pg.query('select count(*) as n from korae_documents where kind=$1 and parent=$2',[kind,parent])).rows[0].n;},
    async put(row,ignore=false){await pg.query(`insert into korae_documents values($1,$2,$3,$4,$5) on conflict(kind,parent,id) do ${ignore?'nothing':'update set body=excluded.body'}`,[row.kind,row.id,row.parent,row.owner,JSON.stringify(row.body)]);},
    async remove(kind,id,parent,owner){await pg.query('delete from korae_documents where kind=$1 and id=$2 and parent=$3 and owner=$4',[kind,id,parent,owner]);},
    async mutate(action,uid,id,value){return (await pg.query('select korae_mutate($1,$2,$3,$4) as result',[action,uid,id,JSON.stringify(value)])).rows[0].result;},
  };
  return {pg,db};
}
