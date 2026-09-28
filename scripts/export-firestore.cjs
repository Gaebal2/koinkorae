// Read-only export using the Firebase CLI's existing OAuth session.
// Run with FIREBASE_TOOLS_DIR set to the installed firebase-tools package directory.
const fs=require('node:fs/promises');
const path=require('node:path');
async function main(){
  const root=process.env.FIREBASE_TOOLS_DIR;
  if(!root) throw Error('Set FIREBASE_TOOLS_DIR to the firebase-tools package directory.');
  const auth=require(path.join(root,'lib/auth.js'));
  const account=auth.getGlobalDefaultAccount();
  if(!account) throw Error('Run firebase login first.');
  const token=await auth.getAccessToken(account.tokens.refresh_token,[]);
  const base='https://firestore.googleapis.com/v1/projects/koinkorae-map/databases/(default)/documents';
  function decode(v){
    if('nullValue' in v)return null;
    if('stringValue' in v)return v.stringValue;
    if('integerValue' in v)return Number(v.integerValue);
    if('doubleValue' in v)return v.doubleValue;
    if('booleanValue' in v)return v.booleanValue;
    if('timestampValue' in v)return Date.parse(v.timestampValue);
    if('arrayValue' in v)return (v.arrayValue.values || []).map(decode);
    if('mapValue' in v)return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,x])=>[k,decode(x)]));
    throw Error('Unsupported Firestore value type: '+Object.keys(v).join(','));
  }
  const rows=[];
  for(const kind of ['profiles','pins','posts','balances','following','reposts','comments']){
    const response=await fetch(base+':runQuery',{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId:kind,allDescendants:['following','reposts','comments'].includes(kind)}]}})});
    if(!response.ok) throw Error('Firestore export failed: '+response.status+' '+kind);
    for(const entry of await response.json()){
      if(!entry.document)continue;
      const document=entry.document,parts=document.name.split('/documents/')[1].split('/');
      const body=Object.fromEntries(Object.entries(document.fields || {}).map(([k,v])=>[k,decode(v)]));
      rows.push({kind,id:parts.at(-1),parent:parts.length>2?parts.at(-3):'',owner:body.ownerId || body.authorId || (kind==='following'?parts.at(-3):parts.at(-1)),body});
    }
  }
  await fs.mkdir('.runtime/supabase-migration',{recursive:true});
  await fs.writeFile('.runtime/supabase-migration/firestore.json',JSON.stringify(rows));
  const sql=value=>"'"+String(value).replaceAll("'","''")+"'";
  await fs.writeFile('.runtime/supabase-migration/import.sql','begin;\n'+rows.map(row=>'insert into public.korae_documents(kind,id,parent,owner,body) values ('+[row.kind,row.id,row.parent,row.owner,JSON.stringify(row.body)].map(sql).join(',')+') on conflict(kind,parent,id) do nothing;').join('\n')+'\ncommit;\nselect kind,count(*) from public.korae_documents group by kind order by kind;');
  await fs.writeFile('.runtime/supabase-migration/verify.sql','select count(*) as mismatches from (values '+rows.map(row=>'('+[row.kind,row.id,row.parent,row.owner,JSON.stringify(row.body)].map(sql).join(',')+')').join(',')+') as source(kind,id,parent,owner,body) left join public.korae_documents target using(kind,id,parent) where target.id is null or target.owner<>source.owner or target.body<>source.body::jsonb;');
  const csv=value=>'"'+String(value).replaceAll('"','""')+'"';
  await fs.writeFile('.runtime/supabase-migration/firestore.csv','kind,id,parent,owner,body\n'+rows.map(row=>[row.kind,row.id,row.parent,row.owner,JSON.stringify(row.body)].map(csv).join(',')).join('\n'));
  console.log(JSON.stringify({counts:Object.fromEntries([...new Set(rows.map(r=>r.kind))].map(kind=>[kind,rows.filter(r=>r.kind===kind).length])),rows:rows.length}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
