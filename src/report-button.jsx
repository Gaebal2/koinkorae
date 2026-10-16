import React,{useRef,useState} from 'react';
import {OctagonAlert} from 'lucide-react';
import {data} from './data.js';
import {useFeedback} from './feedback.jsx';
import {t} from './language.js';
export function ReportButton({kind,item}) {
 const lock=useRef(false),[busy,setBusy]=useState(false);const {confirm,notify}=useFeedback();
 if(!data.reportContent)return null;
 return <button type="button" className="report-button" aria-label={t(kind==='pins'?'Pin 신고':'피드 신고')} title={t('신고')} disabled={busy} onClick={async event=>{
  event.stopPropagation();if(lock.current)return;lock.current=true;
  try{
   if(!await confirm(t('이 내용을 관리자에게 신고할까요?'),{title:t('신고하기'),confirmLabel:t('신고 접수')}))return;
   setBusy(true);const result=await data.reportContent(kind,item.id);
   void notify(t(result.created?'신고가 접수되었습니다. 관리자가 확인할게요.':'이미 신고한 항목입니다.'),{kind:'success',title:t('신고 안내')});
  }catch(error){void notify(t(error.message||'신고를 접수하지 못했습니다.'),{kind:'error'});}
  finally{lock.current=false;setBusy(false);}
 }}><OctagonAlert aria-hidden="true"/></button>;
}
