import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {data} from './data.js';
import {createPagedStore} from './paged-store.js';
import {CommunityPost,useFeedActions} from './community-feed.jsx';
import {Coin,Empty,Segments} from './ui.jsx';
import {SquarePen,ChevronDown,ChevronUp} from 'lucide-react';
import {age} from './api.js';

const pages=createPagedStore({load:(...args)=>data.page(...args),saved:options=>data.savedPage?.(options),observe:fn=>data.observeChanges(fn)});
export function useCursorPage(options,scope){
  const key=JSON.stringify(options);
  const entry=useMemo(()=>pages.get(JSON.parse(key),scope),[key,scope]);
  return {...useSyncExternalStore(entry.subscribe,entry.getSnapshot),more:entry.more,retry:entry.refresh};
}
export function MoreResults({page}){
  const target=useRef(null);
  useEffect(()=>{
    if(!page.nextCursor||page.loading||page.error||!globalThis.IntersectionObserver)return;
    const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting)void page.more();},{rootMargin:'200px'});
    observer.observe(target.current);return()=>observer.disconnect();
  },[page.nextCursor,page.loading,page.error,page.more]);
  return <div ref={target} className="more-results">{page.error?<><p role="alert">목록을 불러오지 못했습니다.</p><button onClick={page.retry}>다시 시도</button></>:page.loading?<p role="status">불러오는 중…</p>:page.nextCursor?<button onClick={page.more}>더 보기</button>:null}</div>;
}
export function feedOptions(options,now=Date.now()){
  const date=new Date(now+9*3600000),year=date.getUTCFullYear(),month=date.getUTCMonth(),day=date.getUTCDate();
  const since=options.period==='오늘'?Date.UTC(year,month,day)-9*3600000:options.period==='이번 달'?Date.UTC(year,month,1)-9*3600000:options.period==='올해'?Date.UTC(year,0,1)-9*3600000:undefined;
  return {mode:options.feed==='코인 피드'?'coins':'posts',category:options.category,...(since!==undefined?{since}:{})};
}
export function PagedPosts({options,me,onPin,onProfile,actions}){
  const page=useCursorPage(options,me?.id);
  return <><div className="feed">{page.items.map(post=><CommunityPost key={post.id} post={post} onPin={onPin} onProfile={onProfile} {...actions}/>)}</div>{!page.loading&&!page.error&&!page.items.length&&<Empty text="아직 게시물이 없습니다"/>}<MoreResults page={page}/></>;
}
export function PagedOwnComments({me,onComment}){
  const page=useCursorPage({mode:'ownComments'},me.id);
  return <><div className="profile-comments">{page.items.map(comment=><article key={comment.id}><b>{comment.post.author} · {comment.post.coin}</b><small>{age(comment.createdAt)}</small><p>{comment.content}</p><button className="text-action" onClick={()=>onComment(comment.post)}>원문과 댓글 보기</button></article>)}</div><MoreResults page={page}/></>;
}
const expanded=new Map();
function CoinGroup({group,options,me,onPin,onProfile,actions}){
  const key=JSON.stringify(options)+group.coin;
  const [open,setOpen]=useState(()=>expanded.get(key)||false);
  return <section className="coin-group"><button className="coin-group-head" aria-expanded={open} onClick={()=>{setOpen(!open);expanded.set(key,!open);}}><Coin symbol={group.coin}/><div><b>{group.coin}</b><small>{options.category==='최신'?age(group.score):group.score.toLocaleString()} · {group.count}개의 피드</small></div>{open?<ChevronUp/>:<ChevronDown/>}</button>{open&&<PagedPosts options={{...options,mode:'posts',coin:group.coin}} me={me} onPin={onPin} onProfile={onProfile} actions={actions}/>}</section>;
}
export function PagedHome({me,options,setOptions,onPin,onProfile,onReposted,login,compose}){
  const query=feedOptions(options),page=useCursorPage(query,me?.id);
  const {actions,overlays}=useFeedActions(me,login,onReposted,true);
  const scrollKey='home:'+JSON.stringify(options);
  useEffect(()=>{
    const top=scrollPositions.get(scrollKey)||0;
    const frame=requestAnimationFrame(()=>window.scrollTo(0,top));
    const remember=()=>scrollPositions.set(scrollKey,window.scrollY);
    window.addEventListener('scroll',remember,{passive:true});
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',remember);};
  },[scrollKey]);
  return <main className="home-page"><div className="feed-controls"><div className="feed-toggle"><Segments items={['유저 피드','코인 피드']} value={options.feed} onChange={feed=>setOptions({...options,feed})}/></div><div className="filters"><Segments compact items={['최신','지지','팔로잉','급상승','논쟁']} value={options.category} onChange={category=>setOptions({...options,category})}/><span className="filter-divider"/><Segments compact items={['오늘','이번 달','올해','전체']} value={options.period} onChange={period=>setOptions({...options,period})}/></div></div>
    {query.mode==='coins'?page.items.map(group=><CoinGroup key={group.coin} group={group} options={query} me={me} onPin={onPin} onProfile={onProfile} actions={actions}/>):<div className="feed">{page.items.map(post=><CommunityPost key={post.id} post={post} onPin={onPin} onProfile={onProfile} {...actions}/>)}</div>}
    {!page.loading&&!page.error&&!page.items.length&&<Empty text="아직 게시물이 없습니다"/>}<MoreResults page={page}/><button className="fab" onClick={compose} aria-label="새 피드 작성"><SquarePen/></button>{overlays}
  </main>;
}
const scrollPositions=new Map();
