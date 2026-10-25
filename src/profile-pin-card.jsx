import React,{useState,useRef,useEffect} from 'react';
import {PinDetailCard} from './ui.jsx';
import {data} from './data.js';
import {useFeedback} from './feedback.jsx';
import {t} from './language.js';
export function ProfilePinCard({pin,onMap,...props}) {
 const [hidden,setHidden]=useState(!!pin.mapHidden),[busy,setBusy]=useState(false),lock=useRef(false);
 const {notify}=useFeedback();
 useEffect(()=>setHidden(!!pin.mapHidden),[pin.mapHidden]);
 return <PinDetailCard {...props} pin={{...pin,mapHidden:hidden}} className={`profile-pin-card ${hidden?'is-map-hidden':''}`} footer={<>
  {hidden&&<span className="pin-hidden-label">{t('지도에서 숨김')}</span>}
  <div className="profile-pin-map-actions">
   <button type="button" className="profile-pin-map" disabled={hidden||busy} onClick={()=>onMap(pin)}>{t('지도에서 보기')}</button>
   {pin.owner&&<button type="button" className="profile-pin-map" disabled={busy} onClick={async()=>{
    if(lock.current)return;lock.current=true;setBusy(true);
    try{await data.setPinMapHidden(pin.id,!hidden);setHidden(!hidden);}catch(error){void notify(error.message,{kind:'error'});}finally{lock.current=false;setBusy(false);}
   }}>{t(busy?'저장 중…':hidden?'지도에서 보이기':'지도에서 숨기기')}</button>}
  </div>
 </>}/>;
}
