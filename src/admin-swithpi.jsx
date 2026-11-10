import React,{useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {swithpi,walletDate} from './pi-wallet.jsx';
import {LoadingIndicator} from './loading-indicator.jsx';
import {t} from './language.js';

export function AdminSwithPi(){
 const [eventId,setEventId]=useState(''),[status,setStatus]=useState('all'),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,refresh]=useState(0);
 const generation=useRef(0);
 async function load(after=null,version=generation.current){
  setBusy(true);setError('');
  try{const next=await swithpi('adminApplications',{eventId,status,after});if(version===generation.current)setResult(previous=>({...next,entries:after?[...(previous?.entries||[]),...next.entries]:next.entries}));}
  catch{if(version===generation.current)setError('신청 내역을 불러오지 못했습니다. 다시 시도해 주세요.');}
  finally{if(version===generation.current)setBusy(false);}
 }
 useEffect(()=>{const version=++generation.current;setResult(null);void load(null,version);return()=>{generation.current++;};},[eventId,status,revision]);
 return <section className="admin-swithpi" aria-label={t('스윗파이 신청 관리')}>
  <div className="admin-swithpi-toolbar">
   <label>{t('이벤트')}<select value={eventId||result?.eventId||''} disabled={busy} onChange={e=>setEventId(e.target.value)}>{!result&&<option value={eventId}>{t('불러오는 중…')}</option>}{result?.events.map(event=><option key={event.id} value={event.id}>{t(event.title)}</option>)}</select></label>
   <label>{t('신청 상태')}<select value={status} disabled={busy} onChange={e=>setStatus(e.target.value)}>{[['all','전체'],['pending','스냅샷 대기'],['allocated','배정 완료 · 미지급'],['paid','지급 완료']].map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
   <button type="button" className="secondary" aria-label={t('새로고침')} disabled={busy} onClick={()=>refresh(n=>n+1)}><RefreshCw size={18}/></button>
  </div>
  {error&&<div role="alert"><p>{t(error)}</p><button className="secondary" onClick={()=>refresh(n=>n+1)}>{t('다시 시도')}</button></div>}
  {result&&<p role="status">{t('신청 내역')} · {result.total} {t('건')} · {t('신청순')}</p>}
  {result?.entries.map(entry=><article className="admin-swithpi-entry" key={entry.sequence}>
   <header><b>#{entry.sequence}</b><span>{t(entry.paid_at?'지급 완료':entry.allocation!=null?'배정 완료 · 미지급':'스냅샷 대기')}</span></header>
   <dl><dt>{t('신청 시각')}</dt><dd>{walletDate(entry.applied_at)}</dd><dt>{t('회원 ID')}</dt><dd>{entry.uid}</dd><dt>{t('Pi 지갑 주소')}</dt><dd>{entry.pi_address}</dd><dt>{t('PSL 수령 지갑 주소')}</dt><dd>{entry.psl_address}</dd><dt>{t('배정 결과')}</dt><dd>{entry.allocation==null?t('스냅샷 대기'):`${entry.allocation} PSL`}</dd>{entry.paid_at&&<><dt>{t('지급 완료일')}</dt><dd>{walletDate(entry.paid_at)}</dd><dt>{t('지급 거래 ID')}</dt><dd>{entry.payout_tx}</dd></>}</dl>
  </article>)}
  {result&&!result.entries.length&&<p>{t('신청 내역이 없습니다.')}</p>}
  {busy&&<LoadingIndicator/>}
  {result?.next&&<button className="secondary" disabled={busy} onClick={()=>void load(result.next)}>{t('더 보기')}</button>}
 </section>;
}
