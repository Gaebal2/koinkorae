import React,{useEffect,useRef,useState} from 'react';
import {ShieldCheck,Flag,Eye,EyeOff,RefreshCw} from 'lucide-react';
import {data} from './data.js';
import {useFeedback} from './feedback.jsx';
import {t,getLocale} from './language.js';
export function AdminReports() {
 const [rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(null),[revision,refresh]=useState(0);
 const {confirm,notify}=useFeedback(),lock=useRef(false),alive=useRef(true),generation=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  ++generation.current;let active=true;setLoading(true);setError('');
  data.adminReports().then(page=>{if(active){setRows(page.items);setCursor(page.nextCursor);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[revision]);
 async function more(){
  if(loading||cursor===null)return;setLoading(true);setError('');const request=generation.current;
  try{const page=await data.adminReports(cursor);if(alive.current&&request===generation.current){setRows(current=>[...new Map([...current,...page.items].map(row=>[row.reportId,row])).values()]);setCursor(page.nextCursor);}}
  catch(e){if(alive.current)setError(e.message);}finally{if(alive.current&&request===generation.current)setLoading(false);}
 }
 async function moderate(row){
  if(lock.current)return;lock.current=true;
  try{
   if(!await confirm(t(row.hidden?'이 항목을 다시 공개할까요?':'이 항목을 모든 사용자 화면에서 가릴까요?'),{title:t(row.hidden?'다시 공개':'콘텐츠 가리기'),confirmLabel:t(row.hidden?'다시 공개':'가리기')}))return;
   setBusy(row.reportId);await data.moderateContent(row.kind,row.targetId,!row.hidden);
   if(alive.current)setRows(current=>current.map(item=>item.reportId===row.reportId?{...item,hidden:!row.hidden}:item));
   void notify(t(row.hidden?'다시 공개했습니다.':'사용자 화면에서 가렸습니다.'),{kind:'success'});
  }catch(e){void notify(t(e.message),{kind:'error'});}
  finally{lock.current=false;if(alive.current)setBusy(null);}
 }
 return <div className="admin-reports">
  <div className="admin-report-heading"><ShieldCheck/><div><h3>{t('신고 관리')}</h3><p>{t('접수된 Pin과 피드를 검토하고 공개 상태를 관리하세요.')}</p></div><button type="button" aria-label={t('새로고침')} disabled={loading||busy!==null} onClick={()=>refresh(value=>value+1)}><RefreshCw size={18}/></button></div>
  {error&&<p role="alert" className="error">{t(error)}<button type="button" onClick={()=>refresh(value=>value+1)}>{t('다시 시도')}</button></p>}
  {!loading&&!error&&!rows.length&&<div className="empty-state"><ShieldCheck/><h3>{t('접수된 신고가 없습니다.')}</h3></div>}
  {rows.map(row=><article key={row.reportId} className="admin-report-card">
   <div className="admin-report-meta"><span>{row.kind==='pins'?'Pin':t('피드')}</span><span><Flag size={13}/>{t('신고 {0}건',row.count)}</span><span className={row.hidden?'is-hidden':''}>{t(!row.item?'삭제됨':row.hidden?'가려짐':'공개 중')}</span></div>
   {row.item?<><h4>{row.item.title||row.item.author||t('피드')}</h4>{row.kind==='pins'&&<small>@{row.item.creator||t('사용자')}</small>}<p>{row.item.description||row.item.content}</p>{row.item.repostComment&&<p>{row.item.repostComment}</p>}{row.item.image&&<img src={row.item.image} loading="lazy" alt={t('신고된 콘텐츠 사진')}/>}</>:<p>{t('작성자가 삭제한 항목입니다.')}</p>}
   <footer><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleDateString(getLocale())}</time><button type="button" disabled={!row.item||busy!==null} onClick={()=>moderate(row)}>{row.hidden?<Eye size={16}/>:<EyeOff size={16}/>} {busy===row.reportId?t('처리 중…'):t(row.hidden?'다시 공개':'가리기')}</button></footer>
  </article>)}
  {loading&&<p role="status">{t('불러오는 중…')}</p>}
  {cursor!==null&&<button type="button" className="secondary" disabled={loading||busy!==null} onClick={more}>{t('더 보기')}</button>}
 </div>;
}
