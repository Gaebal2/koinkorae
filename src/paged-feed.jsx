import { FeedControls } from './feed-controls.jsx';
import { FeedScrollTop } from './feed-scroll-top.jsx';
import { t } from './language.js';
import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {data} from './data.js';
import {createPagedStore} from './paged-store.js';
import {CommunityPost,useFeedActions} from './community-feed.jsx';
import {Coin,Empty} from './ui.jsx';
import {SquarePen,ChevronDown,ChevronUp} from 'lucide-react';
import {age} from './api.js';
import {feedOptions} from './feed-period.js';
export {feedOptions} from './feed-period.js';

const pages=createPagedStore({load:(...args)=>data.page(...args),saved:options=>data.savedPage?.(options),observe:fn=>data.observeChanges(fn)});
const idlePage={items:[],nextCursor:null,loading:false,error:null};
const idleEntry={subscribe:()=>()=>{},getSnapshot:()=>idlePage,more:()=>{},refresh:()=>{}};
export function useCursorPage(options,scope,enabled=true){
  const key=JSON.stringify(options);
  const entry=useMemo(()=>enabled?pages.get(JSON.parse(key),scope):idleEntry,[key,scope,enabled]);
  useEffect(()=>{
    if(!enabled || options.category!=='급상승')return;
    const timer=setInterval(()=>{if(!globalThis.document?.hidden)void entry.refresh();},60000);
    return()=>clearInterval(timer);
  },[entry,enabled,options.category]);
  return {...useSyncExternalStore(entry.subscribe,entry.getSnapshot),more:entry.more,retry:entry.refresh};
}
export function MoreResults({page}){
  const target=useRef(null);
  useEffect(()=>{
    if(!page.nextCursor||page.loading||page.error||!globalThis.IntersectionObserver)return;
    const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting)void page.more();},{rootMargin:'200px'});
    observer.observe(target.current);return()=>observer.disconnect();
  },[page.nextCursor,page.loading,page.error,page.more]);
  return <div ref={target} className="more-results">{page.error?<><p role="alert">{t("목록을 불러오지 못했습니다.")}</p><button onClick={page.retry}>{t("다시 시도")}</button></>:page.loading?<p role="status">{t("불러오는 중…")}</p>:page.nextCursor?<button onClick={page.more}>{t("더 보기")}</button>:null}</div>;
}
export function PagedPosts({options,me,onPin,onProfile,actions,onReady,excludeId}){
  const page=useCursorPage(options,me?.id);
  useEffect(()=>{if(!page.loading&&!page.error)onReady?.();},[page.loading,page.error,onReady]);
  return <><div className="feed">{page.items.filter(post=>post.id!==excludeId).map(post=><CommunityPost key={post.id} post={post} onPin={onPin} onProfile={onProfile} {...actions}/>)}</div>{!excludeId&&!page.loading&&!page.error&&!page.items.length&&<Empty text={t("아직 게시물이 없습니다")}/>}<MoreResults page={page}/></>;
}
export function PagedOwnComments({me,onComment}){
  const page=useCursorPage({mode:'ownComments'},me.id);
  return <><div className="profile-comments">{page.items.map(comment=><article key={comment.id}><b>{comment.post.author} · {comment.post.coin}</b><small>{age(comment.createdAt)}</small><p>{comment.content}</p><button className="text-action" onClick={()=>onComment(comment.post)}>{t("원문과 댓글 보기")}</button></article>)}</div><MoreResults page={page}/></>;
}
const expanded=new Map();
function CoinGroup({focused=false,group,options,me,onPin,onProfile,actions}){
  const key=JSON.stringify(options)+group.coin;
  const [open,setOpen]=useState(()=>focused||expanded.get(key)||false);
  return <section className="coin-group"><button className="coin-group-head" aria-expanded={open} onClick={()=>{setOpen(!open);expanded.set(key,!open);}}><Coin symbol={group.coin}/><div><b>{group.coin}</b><small>{options.category==='최신'?age(group.score):group.score.toLocaleString()} · {group.count != null ? <>{group.count}{t("개의 피드")}</> : null}</small></div>{open?<ChevronUp/>:<ChevronDown/>}</button>{open&&<PagedPosts options={{...options,mode:'posts',coin:group.coin}} me={me} onPin={onPin} onProfile={onProfile} actions={actions}/>}</section>;
}
export function PagedHome({onCoin,me,options,setOptions,onPin,onProfile,onReposted,login,compose}){
  const query=feedOptions(options),page=useCursorPage(query,me?.id);
  const {actions,overlays}=useFeedActions(me,login,onReposted,true);
  actions.onCoin=onCoin;
  const scrollKey='home:'+JSON.stringify(options);
  useEffect(()=>{
    const top=options.focusCoin?0:scrollPositions.get(scrollKey)||0;
    const frame=requestAnimationFrame(()=>window.scrollTo(0,top));
    const remember=()=>scrollPositions.set(scrollKey,window.scrollY);
    window.addEventListener('scroll',remember,{passive:true});
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',remember);};
  },[scrollKey]);
  return <main className="home-page"><FeedControls options={options} setOptions={setOptions}/><FeedScrollTop key={scrollKey}/>
    {query.mode==='coins'?(options.focusCoin ? [page.items.find(group=>group.coin===options.focusCoin)||{coin:options.focusCoin,score:Date.now(),count:null},...page.items.filter(group=>group.coin!==options.focusCoin)] : page.items).map(group=><CoinGroup focused={group.coin===options.focusCoin} key={group.coin+':'+(options.coinSelection||0)} group={group} options={query} me={me} onPin={onPin} onProfile={onProfile} actions={actions}/>):<div className="feed">{page.items.map(post=><CommunityPost key={post.id} post={post} onPin={onPin} onProfile={onProfile} {...actions}/>)}</div>}
    {!page.loading&&!page.error&&!page.items.length&&<Empty text={t("아직 게시물이 없습니다")}/>}<MoreResults page={page}/><button className="fab" onClick={compose} aria-label={t("새 피드 작성")}><SquarePen/></button>{overlays}
  </main>;
}
const scrollPositions=new Map();
