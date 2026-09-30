import React,{useEffect,useState} from 'react';
import {ArrowUp} from 'lucide-react';
import {t} from './language.js';

export function FeedScrollTop(){
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    let previous=Math.max(0,window.scrollY),travel=0,frame=0;
    const measure=()=>{
      frame=0;
      const height=document.documentElement.scrollHeight;
      const maximum=Math.max(0,height-window.innerHeight);
      const y=Math.max(0,Math.min(window.scrollY,maximum)),delta=y-previous;
      previous=y;
      if(y<200){travel=0;setVisible(false);return;}
      if(!delta)return;
      travel=Math.sign(delta)===Math.sign(travel)?travel+delta:delta;
      if(travel<=-12)setVisible(true);
      // Small anchor adjustments during attachment loading must not hide it.
      else if(travel>=80)setVisible(false);
    };
    const scroll=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    window.addEventListener('scroll',scroll,{passive:true});
    return()=>{window.removeEventListener('scroll',scroll);cancelAnimationFrame(frame);};
  },[]);
  return visible?<button className="feed-scroll-top" aria-label={t('피드 맨 위로')} onClick={()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}><ArrowUp/></button>:null;
}
