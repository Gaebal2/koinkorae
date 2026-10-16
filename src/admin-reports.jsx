import React,{useEffect,useRef,useState} from 'react';
import {Siren,CheckCircle2,Trash2,RefreshCw} from 'lucide-react';
import {data} from './data.js';
import {useFeedback} from './feedback.jsx';
import {t,getLocale} from './language.js';
async function loadReports(cursor) {
 let page;
 do {
  page=await data.adminReports(cursor);
  page={...page,items:page.items.filter(row=>!row.hidden)};
  cursor=page.nextCursor;
 } while(!page.items.length&&cursor!==null);
 return page;
}
export function AdminReports() {
 const [rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(null),[revision,refresh]=useState(0);
 const {confirm,notify}=useFeedback(),lock=useRef(false),alive=useRef(true),generation=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  ++generation.current;let active=true;setLoading(true);setError('');
  loadReports().then(page=>{if(active){setRows(page.items);setCursor(page.nextCursor);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[revision]);
 async function more(){
  if(loading||cursor===null)return;setLoading(true);setError('');const request=generation.current;
  try{const page=await loadReports(cursor);if(alive.current&&request===generation.current){setRows(current=>[...new Map([...current,...page.items].map(row=>[row.reportId,row])).values()]);setCursor(page.nextCursor);}}
  catch(e){if(alive.current)setError(e.message);}finally{if(alive.current&&request===generation.current)setLoading(false);}
 }
 async function moderate(row,hidden){
  if(lock.current)return;lock.current=true;
  try{
   if(!await confirm(t(!hidden?'신고를 철회할까요? 신고자와 작성자에게 문제가 없다는 검토 결과를 알립니다.':'이 항목을 삭제할까요? 삭제 후에는 복원하거나 신고를 철회할 수 없으며 작성자에게 삭제 내역이 남습니다.'),{title:t(!hidden?'신고 철회':row.kind==='posts'?'피드 삭제':'Pin 삭제'),confirmLabel:t(!hidden?'신고 철회':row.kind==='posts'?'피드 삭제':'Pin 삭제')}))return;
   setBusy(row.reportId);if(hidden)await data.moderateContent(row.kind,row.targetId,true);else await data.dismissReports(row.kind,row.targetId,row.reportId);
   if(alive.current){setRows(current=>current.filter(item=>item.reportId!==row.reportId));if(hidden)refresh(value=>value+1);}
   void notify(t(!hidden?'신고를 철회하고 검토 결과를 알렸습니다.':'삭제 처리했습니다.'),{kind:'success'});
  }catch(e){void notify(t(e.message),{kind:'error'});}
  finally{lock.current=false;if(alive.current)setBusy(null);}
 }
 return <div className="admin-reports">
  <div className="admin-report-heading"><Siren/><div><h3>{t('신고 관리')}</h3><p>{t('접수된 Pin과 피드를 검토하고 공개 상태를 관리하세요.')}</p></div><button type="button" aria-label={t('새로고침')} disabled={loading||busy!==null} onClick={()=>refresh(value=>value+1)}><RefreshCw size={18}/></button></div>
  {error&&<p role="alert" className="error">{t(error)}<button type="button" onClick={()=>refresh(value=>value+1)}>{t('다시 시도')}</button></p>}
  {!loading&&!error&&!rows.length&&cursor===null&&<div className="empty-state"><Siren/><h3>{t('접수된 신고가 없습니다.')}</h3></div>}
  {rows.map(row=><article key={row.reportId} className="admin-report-card">
   <div className="admin-report-meta"><span>{row.kind==='pins'?'Pin':t('피드')}</span><span><Siren size={13}/>{t('신고 {0}건',row.count)}</span><span>{t(!row.item?'삭제됨':'공개 중')}</span></div>
   {row.item?<><h4>{row.item.title||row.item.author||t('피드')}</h4>{row.kind==='pins'&&<small>@{row.item.creator||t('사용자')}</small>}<p>{row.item.description||row.item.content}</p>{row.item.repostComment&&<p>{row.item.repostComment}</p>}{row.item.image&&<img src={row.item.image} loading="lazy" alt={t('신고된 콘텐츠 사진')}/>}</>:<p>{t('작성자가 삭제한 항목입니다.')}</p>}
   <footer><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleDateString(getLocale())}</time><div className="admin-report-actions"><button type="button" disabled={!row.item||busy!==null||row.hidden||row.kind!=='posts'} onClick={()=>moderate(row,true)}><Trash2 size={15}/>{t('피드 삭제')}</button><button type="button" disabled={!row.item||busy!==null||row.hidden||row.kind!=='pins'} onClick={()=>moderate(row,true)}><Trash2 size={15}/>{t('Pin 삭제')}</button><button type="button" disabled={!row.item||busy!==null||row.hidden} onClick={()=>moderate(row,false)}><CheckCircle2 size={15}/>{t('신고 철회')}</button></div></footer>
  </article>)}
  {loading&&<p role="status">{t('불러오는 중…')}</p>}
  {cursor!==null&&<button type="button" className="secondary" disabled={loading||busy!==null} onClick={more}>{t('더 보기')}</button>}
 </div>;
}
