import {markDeviceNotificationsRead} from './app-badge.js';
import React,{useEffect,useRef,useState} from 'react';
import {ShieldCheck,UserPlus,Siren,Trash2,Bell,MessageCircle,Repeat2,Heart,Share2,MessagesSquare,CalendarCheck,ArrowUpRight,RefreshCw} from 'lucide-react';
import {data} from './data.js';
import {t} from './language.js';
import {age} from './api.js';
import {notificationText,notificationTarget} from '../supabase/functions/community/notifications.js';
const icons={review:ShieldCheck,report:Siren,moderation:Trash2,follow:UserPlus,comment:MessageCircle,reply:MessageCircle,repost:Repeat2,like:Heart,share:Share2,chat:MessagesSquare,checkin:CalendarCheck};
const labels={review:'신고 검토 결과',report:'내 콘텐츠 신고',moderation:'관리자에 의한 삭제',follow:'새 팔로워',comment:'댓글',reply:'내 댓글의 답글',repost:'리포스트',like:'좋아요',share:'공유',chat:'채팅',checkin:'체크인'};
export function NotificationInbox({me}){
 const [items,setItems]=useState([]),[cursor,setCursor]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,refresh]=useState(0);
 const generation=useRef(0),lock=useRef(false);
 useEffect(()=>{const seenAt=Date.now();const request=++generation.current;lock.current=true;setItems([]);setCursor(null);setLoading(true);setError('');
 data.notificationInbox().then(page=>{if(request===generation.current){setItems(page.items);setCursor(page.nextCursor);void markDeviceNotificationsRead(seenAt);}}).catch(()=>{if(request===generation.current)setError('알림을 불러오지 못했습니다. 다시 시도해 주세요.');}).finally(()=>{if(request===generation.current){lock.current=false;setLoading(false);}});
 return()=>{++generation.current;};},[me.id,revision]);
 async function more(){if(lock.current||cursor===null)return;lock.current=true;setLoading(true);setError('');const request=generation.current;
 try{const page=await data.notificationInbox(cursor);if(request===generation.current){setItems(current=>[...new Map([...current,...page.items].map(item=>[item.id,item])).values()]);setCursor(page.nextCursor);}}
 catch{if(request===generation.current)setError('알림을 불러오지 못했습니다. 다시 시도해 주세요.');}
 finally{if(request===generation.current){lock.current=false;setLoading(false);}}}
 return <section className="notification-inbox" aria-label={t('알림 내역')}>
 <div className="notification-inbox-heading"><span>{t('받은 알림을 한곳에서 확인하세요.')}</span><button type="button" aria-label={t('새로고침')} disabled={loading} onClick={()=>refresh(v=>v+1)}><RefreshCw size={18}/></button></div>
 {error&&<p role="alert" className="error">{t(error)}<button onClick={()=>refresh(v=>v+1)}>{t('다시 시도')}</button></p>}
 {!loading&&!error&&!items.length&&<div className="empty-state"><Bell/><h3>{t('아직 받은 알림이 없습니다')}</h3><p>{t('새로운 푸시 알림이 도착하면 여기에 표시됩니다.')}</p></div>}
 {items.map(item=>{const Icon=icons[item.kind]||Bell;return <article className="own-comment-card notification-card" key={item.id}><header className="own-comment-heading"><span className="own-comment-icon"><Icon size={17}/></span><b>{t(labels[item.kind]||'알림')}</b><time dateTime={item.createdAt}>{age(Date.parse(item.createdAt))}</time></header><p className="own-comment-body">{t(notificationText(item.kind))}</p>{item.details?.contentKind&&<p className="notification-context"><b>{item.details.contentKind==='pins'?'Pin':t('피드')}</b>{item.details.summary&&<span>{item.details.summary}</span>}</p>}{notificationTarget(item)&&<a className="notification-open" href={notificationTarget(item)}><span>{t(item.kind==='follow'?'프로필 보기':item.details?.contentKind==='pins'?'Pin 보기':item.kind==='chat'?'채팅 보기':item.kind==='checkin'?'체크인 하러 가기':'관련 피드 보기')}</span><ArrowUpRight size={18}/></a>}</article>;})}
 {loading&&<p role="status">{t('불러오는 중…')}</p>}{cursor!==null&&<button className="secondary" disabled={loading} onClick={more}>{t('더 보기')}</button>}
 </section>;
}
