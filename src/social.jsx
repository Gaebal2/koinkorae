import {CheckinCalendar, useCheckinToday} from './checkin-calendar.jsx';
import { FeedControls } from './feed-controls.jsx';
import { t } from './language.js';
import { useAppMessage, useFeedback } from './feedback.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { CommunityPost, useFeedActions } from './community-feed.jsx';
import { CalendarCheck, Check, Shield, SquarePen, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { data, dayNumber } from './data.js';
import { age } from './api.js';
import { filterFeed } from './feed-model.js';
import { Coin, Empty, Modal, Field, PageTitle } from './ui.jsx';
import { useLiveProfile } from './live-profile.js';
import {useCursorPage} from './paged-feed.jsx';

function CommentAuthor({ id, name, initial }) {
  const live = useLiveProfile(initial ? null : id), profile=initial || live;
  return <span className="comment-author">{profile?.profileImage && <img src={profile.profileImage} alt=""/>}<b>{profile?.username || name}</b></span>;
}

export function HomePage({ onCoin, onPin, onReposted, me, options, setOptions, following, onProfile, compose, login }) {
  const [posts, setPosts] = useState([]), [error, setError] = useAppMessage(), [loading, setLoading] = useState(true), [open, setOpen] = useState({});
  useEffect(() => data.watchPosts(value => { setPosts(value); setLoading(false); setError(''); }, () => { setError('피드를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'); setLoading(false); }), []);
  const { actions, overlays } = useFeedActions(me, login, onReposted);
  actions.onCoin=onCoin;
  useEffect(()=>{if(options.focusCoin){setOpen(current=>({...current,[options.focusCoin]:true}));window.scrollTo(0,0);}},[options.focusCoin,options.coinSelection]);
  const result = filterFeed(posts.map(post => ({...post, likeCount: actions.likes.filter(like => like.postId === post.id).length})), options, following);
  const card = post => <CommunityPost onPin={onPin} key={post.id} post={post} onProfile={onProfile} {...actions}/>;
  return <main className="home-page"><FeedControls options={options} setOptions={setOptions}/>
    {loading && <p className="loading-state" role="status">{t("피드를 불러오는 중…")}</p>}{error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && !result.posts.length && <Empty text={options.category === '팔로잉' ? t("팔로우한 사용자의 게시물이 없습니다") : t("첫 번째 이야기를 남겨보세요")}/>}
    {options.feed === '유저 피드' ? <div className="feed">{result.posts.map(card)}</div> : [...result.groups].sort((a,b)=>Number(b.coin===options.focusCoin)-Number(a.coin===options.focusCoin)).map((group, index) => <section className="coin-group" key={group.coin}><button className="coin-group-head" aria-expanded={!!open[group.coin]} onClick={() => setOpen({ ...open, [group.coin]: !open[group.coin] })}><Coin symbol={group.coin}/><div><b>{group.coin}</b><small>{options.category === '최신' ? age(group.score) : `${t(options.category === '논쟁' ? '논쟁' : options.category === '급상승' ? '급상승' : '코인 지지')} ${group.score.toLocaleString()}`} · {group.items.length}{t("개의 피드")}</small></div>{open[group.coin] ? <ChevronUp/> : <ChevronDown/>}</button>{open[group.coin] && group.items.map(card)}</section>)}
    <button className="fab" onClick={compose} aria-label={t("새 피드 작성")}><SquarePen/></button>
    {overlays}
  </main>;
}

export function Comments({ post, me, close }) {
  return data.page ? <CursorComments post={post} me={me} close={close}/> : <CommentThread post={post} me={me} close={close}/>;
}
function CursorComments(props){
  const page=useCursorPage({mode:'comments',postId:props.post.id},props.me?.id);
  return <CommentThread {...props} query={page}/>;
}
function CommentThread({post,me,close,query}) {
  const { confirm } = useFeedback();
  const [deleting, setDeleting] = useState(null);
  const [pendingScroll, setPendingScroll] = useState(null);
  const [legacyItems, setItems] = useState([]), [content, setContent] = useState(''), [reply, setReply] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useAppMessage();
  const items=query?[...query.items].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)):legacyItems;
  const timer = useRef(null), origin = useRef(null), nodes = useRef(new Map()), sending = useRef(false), input = useRef(null);
  const cancelPress = () => clearTimeout(timer.current);
  useEffect(() => { if(query)return; return data.watchComments(post.id, setItems, () => setError('댓글을 불러오지 못했습니다.')); }, [post.id,!!query]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const node=nodes.current.get(pendingScroll);
    if (node) { node.scrollIntoView({behavior:'smooth',block:'nearest'}); setPendingScroll(null); }
  }, [items,pendingScroll]);
  const selectReply = c => { if (me && !sending.current) { setReply(c); input.current?.focus(); } };
  const remove = async c => {
    if (deleting || !(await confirm('이 댓글을 삭제할까요?', {title:'댓글 삭제', confirmLabel:'삭제'}))) return;
    setDeleting(c.id);
    try { await data.deleteComment(post.id, c.id); if (reply?.id === c.id) setReply(null); }
    catch { setError('댓글을 삭제하지 못했습니다.'); }
    finally { setDeleting(null); }
  };
  const jump = id => {
    const node = nodes.current.get(id);
    if (!node) { setError('원댓글을 현재 목록에서 찾을 수 없습니다.'); return; }
    node.scrollIntoView({ behavior: 'smooth', block: 'center' }); node.focus({ preventScroll: true });
    node.animate([{ backgroundColor: '#ffe480' }, { backgroundColor: 'transparent' }], { duration: 1600 });
  };
  const send = async side => {
    if (sending.current || !content.trim()) return;
    sending.current = true; setBusy(true); setError('');
    try { const saved=await data.comment(post.id, content, side, reply?.id); setPendingScroll(saved.id); setContent(''); setReply(null); }
    catch { setError('댓글을 저장하지 못했습니다.'); }
    finally { sending.current = false; setBusy(false); }
  };
  return <Modal title={t("댓글")} onClose={close} className="comments-modal">
    <div className="chat-messages" aria-label={t("댓글 대화")}>
      {query?.nextCursor&&<button disabled={query.loading} onClick={query.more}>{t("이전 댓글 20개 보기")}</button>}
      {query?.error&&<button onClick={query.retry}>{t("댓글 다시 불러오기")}</button>}
      {!items.length && <p className="form-help">{query?.loading?t("댓글을 불러오는 중…"):t("첫 댓글을 남겨보세요.")}</p>}
      {items.map(c => <article key={c.id} ref={node => { if (node) nodes.current.set(c.id, node); else nodes.current.delete(c.id); }} tabIndex={-1} className={'chat-message ' + (c.side || 'neutral')}>
        <div className="chat-message-head"><CommentAuthor id={c.authorId} name={c.author} initial={c.authorProfile}/>{c.authorId === me?.id && <button type="button" className="chat-delete" disabled={!!deleting} onClick={() => remove(c)} aria-label={t("내 댓글 삭제")}>×</button>}</div>
        <div className="chat-bubble" tabIndex={0} aria-label={c.author + (c.side === 'support' ? t(" 지지") : c.side === 'oppose' ? t(" 반대") : '') + t(" 댓글. 길게 누르거나 Enter 키로 답글 작성")}
          onPointerDown={e => { if (e.button !== 0) return; cancelPress(); origin.current = { x:e.clientX, y:e.clientY }; timer.current = setTimeout(() => selectReply(c), 550); }}
          onPointerMove={e => { if (origin.current && Math.hypot(e.clientX-origin.current.x,e.clientY-origin.current.y)>10) cancelPress(); }}
          onPointerUp={cancelPress} onPointerCancel={cancelPress} onPointerLeave={cancelPress}
          onContextMenu={e => { e.preventDefault(); cancelPress(); selectReply(c); }}
          onKeyDown={e => { if (e.target === e.currentTarget && e.key === 'Enter') { e.preventDefault(); selectReply(c); } }}>
          {c.replyTo && (items.some(parent => parent.id === c.replyTo.id) ? <button type="button" className={'chat-quote quote-' + (items.find(parent => parent.id === c.replyTo.id)?.side || 'neutral')} aria-label={t("원댓글 보기: 두 번 누르기")} onPointerDown={e => e.stopPropagation()} onDoubleClick={() => jump(c.replyTo.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(c.replyTo.id); } }}><CommentAuthor id={items.find(parent => parent.id === c.replyTo.id)?.authorId} name={c.replyTo.author}/><span>{c.replyTo.content}</span></button> : <div className="chat-quote">{c.replyExists ? <><b>{c.replyTo.author}</b><span>{c.replyTo.content}</span><small>{t("이전 댓글에서 원문을 확인할 수 있습니다.")}</small></> : t("삭제된 댓글입니다.")}</div>)}
          <p>{c.content}</p>
        </div><small>{age(c.createdAt)}{!c.side && t(" · 입장 미선택")}</small>
      </article>)}
    </div>
    {me ? <form className="chat-composer" onSubmit={e => e.preventDefault()}>
      {reply && <div className="chat-reply-preview"><div><b>{reply.author}{t("에게 답글")}</b><span>{reply.content}</span></div><button type="button" disabled={busy} onClick={() => setReply(null)} aria-label={t("답글 취소")}>×</button></div>}
      <div className="chat-input-row"><button type="button" className="chat-send support" disabled={busy || !content.trim()} onClick={() => send('support')}>{t("지지")}</button><textarea ref={input} aria-label={t("댓글")} disabled={busy} maxLength={1000} value={content} onChange={e => setContent(e.target.value)} placeholder={t("댓글을 입력하세요")}/><button type="button" className="chat-send oppose" disabled={busy || !content.trim()} onClick={() => send('oppose')}>{t("반대")}</button></div>
      <small>{t("댓글을 길게 눌러 답글 · 인용문을 두 번 눌러 원댓글 보기")}</small>
    </form> : <p className="form-help">{t("로그인하면 댓글을 남길 수 있습니다.")}</p>}{error && <p className="error" role="alert">{error}</p>}</Modal>;
}

export function CheckinPage({ me, balance, login }) {
  const { notify, confirm } = useFeedback();
  const [busy, setBusy] = useState(false), [error, setError] = useAppMessage();
  const today = useCheckinToday();
  const [completedDay,setCompletedDay] = useState(null);
  const checked = !!me && (balance.day === today || completedDay === me.id+':'+today);
  const checkin = async () => {
    if (busy || checked) return;
    if (!me) { login(); return; }
    setBusy(true); setError('');
    try {
      if (!(await confirm('오늘 출석체크 하시겠습니까?', {title:'출석체크',confirmLabel:'출석체크'}))) return;
      await data.checkin();
      setCompletedDay(me.id+':'+today);
      void notify('오늘 출석이 완료됐습니다. 10 BP를 받았습니다.', {kind:'success',title:'출석 완료'});
    } catch { setError('출석을 저장하지 못했습니다. 기기 날짜와 인터넷 연결을 확인해 주세요.'); }
    finally { setBusy(false); }
  };
  return <main><PageTitle icon={CalendarCheck} title={t("오늘의 BP")} sub={t("매일 출석하고 Battle Point를 모으세요")}/><section className="balance-card"><span>{t("보유 BP")}</span><strong>{balance.current}</strong><small>Lifetime Earned · {balance.lifetime.toLocaleString()} BP</small></section>
    <div className="checkin-action-row"><button type="button" className="primary checkin-action" disabled={busy || checked} onClick={checkin}>{checked ? <Check/> : <CalendarCheck/>}{checked ? t('출석 완료') : busy ? t('출석 확인 중…') : t('출석체크')}</button></div>
    <CheckinCalendar key={me?.id || 'guest'} balance={checked ? {...balance,day:today} : balance} signedIn={!!me} today={today}/>
    <section className="reward-row"><div><span>REWARDED AD</span><b>{t("광고 보상 준비 중")}</b><small>{t("광고 서비스 연결 후 이용할 수 있어요")}</small></div><button disabled>{t("준비 중")}</button></section>{error && <p className="error" role="alert">{error}</p>}<div className="notice-box"><Shield/><p>{t("BP는 커뮤니티 참여 포인트입니다.")}<br/>{t("배틀은 무료로 참여할 수 있습니다.")}</p></div>
  </main>;
}
