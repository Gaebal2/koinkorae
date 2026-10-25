import React,{useId} from 'react';
import {rankArtwork,rankIndex} from './rank-artwork.js';
import {t} from './language.js';
export function RankBadge({level=0,className=''}) {
  const id=useId().replace(/:/g,'');
  const index=rankIndex({level}),art=rankArtwork[index];
  if(!art)return null;
  return <svg className={`rank-badge rank-badge-${index} ${className}`} viewBox="0 0 64 64" role="img" aria-label={t(art.name)}>
    <title>{t(art.name)}</title>
    <defs><linearGradient id={`${id}-rim`} x2=".8" y2="1"><stop stopColor={art.light}/><stop offset=".45" stopColor={art.color}/><stop offset="1" stopColor={art.dark}/></linearGradient><linearGradient id={`${id}-sea`} x2=".5" y2="1"><stop stopColor={art.dark}/><stop offset="1" stopColor={art.sea || "#191b3d"}/></linearGradient><linearGradient id={`${id}-animal`} x2=".4" y2="1"><stop stopColor="#fff"/><stop offset="1" stopColor={art.light}/></linearGradient></defs>
    <path d="M32 2 53 12 61 34 48 54 32 62 16 54 3 34 11 12Z" fill={`url(#${id}-rim)`} stroke="white" strokeWidth="2"/>
    <path d="M32 7 49 15 55 33 44 49 32 56 20 49 9 33 15 15Z" fill={`url(#${id}-sea)`} stroke={art.light} strokeOpacity=".7"/>
    <path d="M15 22 19 16 32 10 45 16" fill="none" stroke="white" opacity=".25" strokeWidth="2"/>
    <g fill={`url(#${id}-animal)`} stroke={art.light} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={art.body}/><path d={art.path} fill="none"/></g>
    {art.details&&<path d={art.details} fill="none" stroke={art.dark} strokeOpacity=".45" strokeWidth="1.25" strokeLinecap="round"/>}
    {art.fin&&<path d={art.fin} fill={art.light} stroke={art.dark} strokeOpacity=".35" strokeWidth="1.25" strokeLinejoin="round"/>}
    {art.eyes.map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} r="1.6" fill={art.dark}/>)}
    <path d="m32 51 2 3-2 3-2-3Z" fill={art.light}/>
    {index>=4&&<path d="m49 11 1.5 4.5L55 17l-4.5 1.5L49 23l-1.5-4.5L43 17l4.5-1.5Z" fill="#fff"/>}
    {index===6&&<path d="m23 7 3 3 6-6 6 6 3-3-2 8H25Z" fill="#fff1b5" stroke="#b17e2a"/>}
  </svg>;
}
export function RankedAvatar({src,profile,level,className='',alt=''}){
 return <span className={`ranked-avatar ${className}`}><img src={src} alt={alt}/><RankBadge level={level ?? rankIndex(profile)}/></span>;
}
