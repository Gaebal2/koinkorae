import React, {useEffect, useState} from 'react';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {t} from './language.js';
import {dayNumber} from './data.js';

export function CheckinCalendar({balance, signedIn, today}) {
  const current = new Date(today * 86400000);
  const [month,setMonth] = useState(()=>({year:current.getUTCFullYear(),month:current.getUTCMonth()}));
  const [focused,setFocused] = useState(today);
  const first = Date.UTC(month.year,month.month,1)/86400000;
  const count = new Date(Date.UTC(month.year,month.month+1,0)).getUTCDate();
  const offset = new Date(first*86400000).getUTCDay();
  const days = new Set([...(balance.checkinDays || []),balance.day]);
  const historySince = balance.historySince ?? today;
  const move = delta => {const next=new Date(Date.UTC(month.year,month.month+delta,1));setMonth({year:next.getUTCFullYear(),month:next.getUTCMonth()});};
  return <section className="checkin-calendar" aria-label={t('출석 달력')}>
    <header><button onClick={()=>move(-1)} aria-label={t('이전 달')}><ChevronLeft/></button><h2>{t('{0}년 {1}월',month.year,month.month+1)}</h2><button onClick={()=>move(1)} aria-label={t('다음 달')}><ChevronRight/></button></header>
    <div className="calendar-grid">{['일','월','화','수','목','금','토'].map(day=><span className="calendar-weekday" key={day}>{t(day)}</span>)}
      {Array.from({length:offset},(_,i)=><span key={'blank'+i}/>)}
      {Array.from({length:count},(_,i)=>{const day=first+i;const status=!signedIn || day>today ? '' : days.has(day) ? 'V' : day>=historySince ? 'X' : '—';
        return <button key={day} className={'calendar-day'+(day===today?' today':'')+(day===focused?' focused':'')} aria-current={day===today?'date':undefined} aria-label={t('{0}일',i+1)+(status?' · '+t(status==='V'?'출석 완료':status==='X'?'미출석':'기록 없음'):'')} onClick={()=>setFocused(day)}><span>{i+1}</span><strong className={status==='V'?'attended':status==='X'?'missed':'unknown'}>{status || '\u00a0'}</strong></button>;
      })}
    </div><p>{signedIn?t('V 출석 완료 · X 미출석 · — 기록 없음'):t('로그인하면 출석 기록을 볼 수 있어요.')}</p>
  </section>;
}

export function useCheckinToday() {
  const [today,setToday]=useState(()=>dayNumber());
  useEffect(()=>{const update=()=>setToday(dayNumber());const timer=setInterval(update,30000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[]);
  return today;
}
