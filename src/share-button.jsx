import {data} from './data.js';
import React, {useRef, useState} from 'react';
import {Share2} from 'lucide-react';
import {shareContent, shareUrl} from './share.js';
import {useFeedback} from './feedback.jsx';
import {t} from './language.js';
export function ShareButton({kind, item}) {
 const lock=useRef(false), [busy,setBusy]=useState(false); const {notify}=useFeedback();
 return <button type="button" className="external-share-button" disabled={busy} aria-label={t('공유')} title={t('공유')} onClick={async event=>{
 event.stopPropagation(); if(lock.current)return; lock.current=true;setBusy(true);
 try { if(kind==='post')void data.recordShare?.(item.originalPostId||item.id).catch(()=>{});
 const url=shareUrl(kind,item.originalPostId||item.id);
 const result=await shareContent({title:item.title||'Koin Korae',text:(item.content||item.description||'').slice(0,200),url});
 if(result==='copied')void notify(t('공유 링크를 복사했습니다.'),{kind:'success'});
 if(result==='manual')window.prompt(t('공유 링크를 복사해 주세요.'),url);
 }finally{lock.current=false;setBusy(false);}
 }}><Share2 aria-hidden="true"/></button>;
}
