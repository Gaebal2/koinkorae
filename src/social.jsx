import { useAppMessage, useFeedback } from './feedback.jsx';
import React, { useEffect, useState } from 'react';
import { CommunityPost, useFeedActions } from './community-feed.jsx';
import { coinRanks } from './community-model.js';
import { CalendarCheck, Check, Shield, SquarePen, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { data, dayNumber } from './data.js';
import { age } from './api.js';
import { filterFeed } from './feed-model.js';
import { Segments, Coin, Empty, Modal, Field, PageTitle } from './ui.jsx';

export function HomePage({ onPin, me, options, setOptions, following, onProfile, compose, login }) {
  const [posts, setPosts] = useState([]), [error, setError] = useAppMessage(), [loading, setLoading] = useState(true), [open, setOpen] = useState({});
  useEffect(() => data.watchPosts(value => { setPosts(value); setLoading(false); setError(''); }, () => { setError('피드를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'); setLoading(false); }), []);
  const result = filterFeed(posts, options, following);
  const { actions, overlays } = useFeedActions(me, login);
  const ranks = coinRanks(filterFeed(posts, { ...options, category: '노출' }).posts);
  const card = post => <CommunityPost onPin={onPin} key={post.id} post={post} rank={ranks.get(post.coin)} onProfile={onProfile} {...actions}/>;
  return <main className="home-page"><div className="feed-controls"><div className="feed-toggle"><Segments items={['유저 피드', '코인 피드']} value={options.feed} onChange={feed => setOptions({ ...options, feed })}/></div><div className="filters"><Segments compact items={['노출', '최신', '팔로잉', '급상승', '논쟁']} value={options.category} onChange={category => setOptions({ ...options, category })}/><span className="filter-divider"/><Segments compact items={['오늘', '이번 달', '올해', '전체']} value={options.period} onChange={period => setOptions({ ...options, period })}/></div></div>
    {loading && <p className="loading-state" role="status">피드를 불러오는 중…</p>}{error && <p className="error" role="alert">{error}</p>}
    {!loading && !error && !result.posts.length && <Empty text={options.category === '팔로잉' ? '팔로우한 사용자의 게시물이 없습니다' : '첫 번째 이야기를 남겨보세요'}/>}
    {options.feed === '유저 피드' ? <div className="feed">{result.posts.map(card)}</div> : result.groups.map((group, index) => <section className="coin-group" key={group.coin}><button className="coin-group-head" aria-expanded={!!open[group.coin]} onClick={() => setOpen({ ...open, [group.coin]: !open[group.coin] })}><Coin symbol={group.coin}/><div><b>#{ranks.get(group.coin)} {group.coin}</b><small>{options.category === '최신' ? age(group.score) : `${options.category === '논쟁' ? '논쟁' : options.category === '급상승' ? '급상승' : '코인 노출'} ${group.score.toLocaleString()}`} · {group.items.length}개의 피드</small></div>{open[group.coin] ? <ChevronUp/> : <ChevronDown/>}</button>{open[group.coin] && group.items.map(card)}</section>)}
    <button className="fab" onClick={compose} aria-label="새 피드 작성"><SquarePen/></button>
    {overlays}
  </main>;
}

export function Comments({ post, me, close }) {
  const [items, setItems] = useState([]), [content, setContent] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useAppMessage();
  useEffect(() => data.watchComments(post.id, setItems, () => setError('댓글을 불러오지 못했습니다.')), [post.id]);
  return <Modal title="댓글" onClose={close}><p className="post-body">{post.content}</p><div className="comment-list">{items.map(c => <article key={c.id}><b>{c.author}</b><small>{age(c.createdAt)}</small><p>{c.content}</p></article>)}</div>{me ? <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await data.comment(post.id, content); setContent(''); } catch { setError('댓글을 저장하지 못했습니다.'); } finally { setBusy(false); } }}><Field label="댓글"><textarea required maxLength={1000} value={content} onChange={e => setContent(e.target.value)}/></Field><button className="primary" disabled={busy || !content.trim()}>댓글 게시</button></form> : <p className="form-help">로그인하면 댓글을 남길 수 있습니다.</p>}{error && <p className="error" role="alert">{error}</p>}</Modal>;
}

export function CheckinPage({ me, balance, login }) {
  const { notify } = useFeedback();
  const [busy, setBusy] = useState(false), [error, setError] = useAppMessage();
  const checked = balance.day === dayNumber();
  return <main><PageTitle icon={CalendarCheck} title="오늘의 BP" sub="매일 출석하고 Battle Point를 모으세요"/><section className="balance-card"><span>보유 BP</span><strong>{balance.current}</strong><small>Lifetime Earned · {balance.lifetime.toLocaleString()} BP</small></section>
    <section className="check-card"><div className="calendar-mark"><CalendarCheck/></div><h2>{checked ? '오늘 출석 완료!' : '매일 출석하고 +10 BP'}</h2><p>{checked ? '내일 다시 만나요' : '한국 시간 자정에 새 출석이 시작됩니다.'}</p><button className="primary" disabled={busy || checked} onClick={async () => { if (!me) { login(); return; } setBusy(true); setError(''); try { await data.checkin(); void notify('오늘 출석이 완료됐습니다. 10 BP를 받았습니다.', {kind:'success',title:'출석 완료'}); } catch { setError('출석을 저장하지 못했습니다. 기기 날짜와 인터넷 연결을 확인해 주세요.'); } finally { setBusy(false); } }}>{busy ? '출석 확인 중…' : checked ? <><Check/>지급 완료</> : me ? <><Zap/>출석 체크</> : '로그인하고 출석하기'}</button></section>
    <section className="reward-row"><div><span>REWARDED AD</span><b>광고 보상 준비 중</b><small>광고 서비스 연결 후 이용할 수 있어요</small></div><button disabled>준비 중</button></section>{error && <p className="error" role="alert">{error}</p>}<div className="notice-box"><Shield/><p>BP는 커뮤니티 참여 포인트입니다.<br/>배틀 사용 기능은 서버 연결을 준비 중입니다.</p></div>
  </main>;
}
