import React, {useState} from 'react';
import {contentParts,youtubeVideo} from './content-links.js';
import {t} from './language.js';
function YoutubePlayer({video}) {
 const [opened,setOpened]=useState(false);
 return <div className="feed-video">
  {opened ? <iframe title={t('유튜브 영상')} src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&playsinline=1&start=${video.start}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/> : <button type="button" className="feed-video-play" onClick={()=>setOpened(true)}><span aria-hidden="true">▶</span>{t('유튜브 영상 재생')}</button>}
  <a href={`https://www.youtube.com/watch?v=${video.id}&t=${video.start}`} target="_blank" rel="noopener noreferrer" onClick={event=>event.stopPropagation()}>{t('YouTube에서 보기')}</a>
 </div>;
}
export function FeedContent({content}) {
 const parts=contentParts(content), videos=[...new Map(parts.filter(p=>p.href).map(p=>youtubeVideo(p.href)).filter(Boolean).map(v=>[v.id,v])).values()];
 return <><p className="post-body">{parts.map((part,index)=>part.href ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" onClick={event=>event.stopPropagation()}>{part.text}</a> : part.text)}</p>{videos.map(video=><YoutubePlayer key={`${video.id}:${video.start}`} video={video}/>)}</>;
}
