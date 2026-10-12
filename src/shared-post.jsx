import React,{useEffect,useState} from 'react';
import {data} from './data.js';
import {Modal} from './ui.jsx';
import {CommunityPost,useFeedActions} from './community-feed.jsx';
import {t} from './language.js';
export function SharedPost({id,me,login,onClose,onPin,onProfile,onCoin}) {
 const [post,setPost]=useState(null),[status,setStatus]=useState('loading'),[revision,retry]=useState(0);
 const {actions,overlays}=useFeedActions(me,login);
 useEffect(()=>{let active=true;setStatus('loading');
 const receive=rows=>{if(active){setPost(rows.find(row=>row.id===id)||null);setStatus('ready');}};
 const fail=()=>{if(active)setStatus('error');};
 if(data.postsById){data.postsById([id]).then(receive,fail);return()=>{active=false;};}
 const stop=data.watchPosts(receive,fail);return()=>{active=false;stop();};
 },[id,revision]);
 return <><Modal title={t('공유 피드')} onClose={onClose}>{status==='loading'?<p role="status">{t('불러오는 중…')}</p>:status==='error'?<button onClick={()=>retry(n=>n+1)}>{t('다시 시도')}</button>:post?<CommunityPost post={post} {...actions} onPin={onPin} onProfile={onProfile} onCoin={onCoin}/>:<p role="status">{t('삭제되었거나 더 이상 존재하지 않는 피드입니다.')}</p>}</Modal>{overlays}</>;
}
