import React,{useEffect,useRef,useState} from 'react';
import {ShieldCheck,UserPlus,Siren,Trash2,Bell,MessageCircle,Repeat2,Heart,Share2,MessagesSquare,CalendarCheck} from 'lucide-react';
import {data} from './data.js';
import {enableDevicePush,pushSupported} from './push-notifications.js';
import {t} from './language.js';
const options=[['review','신고 검토 결과','내 신고 또는 내 콘텐츠의 신고 검토가 끝났을 때',ShieldCheck],['report','내 콘텐츠 신고','내 피드나 Pin에 신고가 접수될 때',Siren],['moderation','관리자에 의한 삭제','관리자가 내 피드나 Pin을 삭제할 때',Trash2],['follow','새 팔로워','누군가 나를 팔로우할 때',UserPlus],['comment','댓글','내 피드에 달린 새 댓글',MessageCircle],['reply','내 댓글의 답글','내가 남긴 댓글에 달린 답글',MessageCircle],['repost','리포스트','내 피드를 리포스트한 소식',Repeat2],['like','좋아요','내 피드에 도착한 좋아요',Heart],['share','공유','내 피드의 공유 버튼을 누른 소식',Share2],['chat','친구 채팅','맞팔 친구의 새 메시지',MessagesSquare],['checkin','체크인','다음 체크인이 가능해질 때',CalendarCheck]];
export function NotificationSettings({me}) {
 const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,retry]=useState(0),lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let active=true;setState(null);setError('');data.notificationSettings().then(value=>{if(active)setState(value);}).catch(()=>{if(active)setError(t('알림 설정을 불러오지 못했습니다.'));});return()=>{active=false;};},[me.id,revision]);
 async function change(key,on){
  if(lock.current||!state)return;lock.current=true;setBusy(true);setError('');
  const next={...state.preferences,[key]:on};
  if(key==='enabled'&&on&&!options.some(([id])=>next[id]))for(const [id] of options)next[id]=true;
  try {
   if(on&&(key==='enabled'||next.enabled))await enableDevicePush(state.publicKey,data);
   const saved=await data.saveNotificationSettings(next);
   if(alive.current)setState({...state,preferences:saved});
  }catch(e){if(alive.current)setError(t(e.message));}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 const switchButton=(key,label,on,disabled=false)=><button type="button" className="notification-switch" role="switch" aria-label={t(label)} aria-checked={on} disabled={busy||disabled} onClick={()=>change(key,!on)}><span/></button>;
 return <section className="notification-settings" aria-labelledby="notification-heading" aria-busy={busy}>
  <div className="notification-heading"><span className="notification-heading-icon"><Bell size={21}/></span><div><h3 id="notification-heading">{t('알림 설정')}</h3><p>{t('받고 싶은 소식만 골라보세요')}</p></div></div>
  {!state&&!error&&<p role="status">{t('불러오는 중…')}</p>}
  {state&&<><div className="notification-master"><div><b>{t('전체 알림')}</b><small>{t('전체 알림을 한 번에 켜거나 꺼요')}</small></div>{switchButton('enabled','전체 알림',state.preferences.enabled,!state.publicKey&&!state.preferences.enabled)}</div>
   {!state.publicKey&&<p className="notification-help">{t('알림 서비스 준비 중입니다.')}</p>}
   {!pushSupported()&&<p className="notification-help">{t('iPhone에서는 홈 화면에 앱을 추가한 뒤 알림을 켜 주세요.')}</p>}
   {pushSupported()&&Notification.permission==='denied'&&<p className="notification-help">{t('기기 설정에서 이 앱의 알림 권한을 허용해 주세요.')}</p>}
   <div className="notification-options">{options.map(([key,label,description,Icon])=><div className="notification-option" key={key}><Icon size={18}/><div><b>{t(label)}</b><small>{t(description)}</small></div>{switchButton(key,label,state.preferences[key],!state.preferences.enabled)}</div>)}</div>
   <p className="notification-help">{t('체크인 알림은 한국 시간 자정 이후 도착해요. 알림 설정은 계정에 저장되며, 기기마다 알림 권한을 허용해야 해요.')}</p>
   {state.preferences.enabled&&<button type="button" className="notification-device" disabled={busy} onClick={()=>change('enabled',true)}>{t('이 기기에서 알림 받기')}</button>}
  </>}
  {error&&<p className="notification-error" role="alert">{error}{!state&&<button type="button" onClick={()=>retry(value=>value+1)}>{t('다시 시도')}</button>}</p>}
 </section>;
}
