import {formatCompactNumber} from './number-format.js';
import { t } from './language.js';
import React, { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Repeat2, Swords, MoreVertical, Pin, Trash2 } from 'lucide-react';
import { data } from './data.js';
import { age } from './api.js';
import { Coin, Modal, PinDetailCard, profileImage } from './ui.jsx';
import { useAppMessage, useFeedback } from './feedback.jsx';
import { BattleGames } from './battle-games.jsx';
import {BattleRankings} from './battle-rankings.jsx';
import { Comments } from './social.jsx';
import { useLiveProfile } from './live-profile.js';

export function useFeedActions(me, login, onReposted, enriched = false) {
  const { confirm, notify } = useFeedback();
  const ownProfile = useLiveProfile(me?.id);
  const [, setError] = useAppMessage();
  const [battle, setBattle] = useState(null), [comments, setComments] = useState(null), [photo, setPhoto] = useState(null), [reposts, setReposts] = useState([]), [busy, setBusy] = useState(false);
  useEffect(() => { if(enriched)return; return data.watchReposts(setReposts, () => setError('리포스트를 불러오지 못했습니다.')); }, [enriched]);
  const [repostDraft, setRepostDraft] = useState(null), [repostComment, setRepostComment] = useState('');
  const repostLock = useRef(false);
  const saveRepost = async () => {
    if (repostLock.current || !repostDraft || repostComment.length > 100) return;
    repostLock.current = true; setBusy(true);
    try { await data.repost(repostDraft.id, true, repostComment); setRepostDraft(null); onReposted?.(); }
    catch { setError('리포스트를 저장하지 못했습니다.'); }
    finally { repostLock.current = false; setBusy(false); }
  };
  const cancelRepost = async post => {
    if (!me || repostLock.current) return;
    repostLock.current = true;
    try {
      if (!(await confirm('리포스트를 취소 하시겠습니까?', {title:'리포스트 취소', confirmLabel:'리포스트 취소', cancelLabel:'유지'}))) return;
      setBusy(true);
      await data.repost(post.id, false);
    } catch { setError('리포스트를 저장하지 못했습니다.'); }
    finally { repostLock.current = false; setBusy(false); }
  };
  const [likes, setLikes] = useState([]);
  useEffect(() => { if(enriched)return; return data.watchLikes?.(setLikes, () => setError('좋아요를 불러오지 못했습니다.')); }, [enriched]);
  const actions = {
    pinnedPostId: ownProfile?.pinnedPostId,
    pinnedRepostId: ownProfile?.pinnedRepostId,
    onPinProfile: async post => { await data.pinProfilePost(post.id, ownProfile?.[post.originalPostId ? 'pinnedRepostId' : 'pinnedPostId'] !== post.id); },
    activeCommentId: comments?.id, me, reposts, likes, busy, onCancelRepost: cancelRepost, repostNavigates: !!onReposted, onBattle: post => me ? setBattle(post) : login(), onComment: setComments, onPhoto: setPhoto,
    onLike: async (post, enabled) => { if (!me) { login(); return; } await data.like(post.id, enabled); },
    onRepost: async post => {
      if (!me) { login(); return; }
      if (busy) return;
      const shared = post.reposted ?? reposts.some(r => r.postId === (post.originalPostId || post.id) && r.userId === me.id);
      if (!shared) { setRepostComment(''); setRepostDraft(post); return; }
      if (onReposted) { onReposted(); return; }
      await cancelRepost(post);
    },
    onDelete: async post => {
      if (!(await confirm('이 게시물을 삭제할까요? 삭제 후에는 복구할 수 없습니다.', {title:'게시물 삭제',confirmLabel:'삭제'}))) return;
      try { await data.deletePost(post.id); void notify('게시물을 삭제했습니다.', {kind:'success',title:'삭제 완료'}); }
      catch { setError('게시물을 삭제하지 못했습니다.'); }
    },
  };
  const overlays = <>{repostDraft && <Modal title={t('리포스트')} onClose={() => { if (!repostLock.current) setRepostDraft(null); }} className="repost-composer"><form onSubmit={event => { event.preventDefault(); void saveRepost(); }}><label className="field"><span>{t('리포스트 코멘트')}</span><textarea autoFocus rows={3} maxLength={100} value={repostComment} disabled={busy} placeholder={t('이 피드에 대한 생각을 남겨보세요')} onChange={event => setRepostComment(event.target.value)}/></label><div className="repost-compose-footer"><small aria-live="polite">{repostComment.length}/100</small><button className="primary" type="submit" disabled={busy}>{t(busy ? '저장 중…' : '리포스트')}</button></div></form></Modal>}{battle && <BattleGames post={battle} onClose={() => setBattle(null)}/ >}{comments && <Comments post={comments} me={me} close={() => setComments(null)}/ >}{photo && <Modal title={t("피드 사진")} onClose={() => setPhoto(null)}><img className="expanded-photo" src={photo} alt={t("피드 첨부 사진 확대")}/></Modal>}</>;
  return { actions, overlays };
}

function AttachedPin({ id, onPin }) {
  const [pin, setPin] = useState(null), [status, setStatus] = useState('loading');
  const [revision, retry] = useState(0);
  useEffect(() => {
    let active = true; setStatus('loading'); setPin(null);
    if(data.watchPin)return data.watchPin(id,value=>{setPin(value);setStatus(value?'ready':'missing');},()=>setStatus('error'));
    data.getPin(id).then(value => { if (active) { setPin(value); setStatus(value ? 'ready' : 'missing'); } }, () => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [id, revision]);
  if (!pin) return <div className="attached-pin-status" role="status">{status === 'loading' ? t("첨부 Pin을 불러오는 중…") : status === 'missing' ? t("삭제된 Pin입니다.") : <button type="button" onClick={() => retry(value => value + 1)}>{t("Pin 다시 불러오기")}</button>}</div>;
  return <PinDetailCard pin={pin} className="feed-pin-card" onActivate={() => onPin?.(id)}/>;
}

export function CommunityPost({ onCoin, onPin, post, onProfile, me, reposts, likes = [], busy, repostNavigates, onBattle, onComment, onRepost, onCancelRepost, onLike, onPhoto, onDelete, onPinProfile, pinnedPostId, pinnedRepostId, activeCommentId }) {
  const [ranking,setRanking]=useState(false), [menu,setMenu]=useState(false), [managing,setManaging]=useState(false);
  const {notify}=useFeedback();
  const own=(post.repostAuthorId || post.authorId)===me?.id;
  const manage=async action=>{if(managing)return;setManaging(true);try{await action();setMenu(false);}catch{void notify(t("피드 설정을 저장하지 못했습니다. 다시 시도해 주세요."),{kind:"error"});}finally{setManaging(false);}};
  const element = useRef(null);
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    if (!globalThis.IntersectionObserver) { setNearViewport(true); return; }
    // Once rendered, keep attachments mounted: replacing them offscreen changes
    // the document height and makes mobile scrolling jump.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNearViewport(true); observer.disconnect(); }
    }, { rootMargin: '300px' });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  const liveAuthor = useLiveProfile(nearViewport && !('authorProfile' in post) ? post.authorId : null);
  const authorProfile = post.authorProfile || liveAuthor;
  const authorName = authorProfile?.username || post.author;
  const [count, setCount] = useState(null);
  useEffect(() => { if (!nearViewport || post.commentCount !== undefined) return; return data.watchCommentCount(post.id, setCount, () => setCount(null)); }, [post.id, nearViewport, post.commentCount]);
  const total = post.support + post.oppose, score = post.support - post.oppose;
  const shared = reposts.filter(r => r.postId === (post.originalPostId || post.id)), isShared = post.reposted ?? shared.some(r => r.userId === me?.id);
  const shownCount=post.commentCount ?? count;
  const postLikes = likes.filter(like => like.postId === post.id);
  const likeCount = post.likeCount ?? postLikes.length;
  const liked = post.liked ?? postLikes.some(like => like.userId === me?.id);
  return <article ref={element} className="post-card">
    {post.originalPostId && <div className="repost-context"><div className="repost-context-heading">{own ? <button type="button" className="feed-menu-button" aria-label={t('리포스트 관리')} aria-haspopup="dialog" disabled={busy} onClick={()=>setMenu(true)}><MoreVertical/></button> : <span className="repost-badge" aria-hidden="true"><Repeat2 size={16}/></span>}<button className="repost-profile" onClick={() => onProfile(post.repostAuthorId)}><img src={post.repostProfile?.profileImage || profileImage()} alt=""/><span className="repost-author-meta"><b>{post.repostProfile?.username || t('사용자')}</b><small>{t('리포스트')} · {age(post.createdAt)}</small></span></button></div>{post.repostComment && <p>{post.repostComment}</p>}</div>}
    <div className="post-head">{!post.originalPostId && own&&<button type="button" className="feed-menu-button" aria-label={t("피드 관리")} aria-haspopup="dialog" onClick={()=>setMenu(true)}><MoreVertical/></button>}<button className="avatar tone-purple" onClick={() => onProfile(post.authorId)} aria-label={t("{0} 프로필 보기", authorName)}>{authorProfile?.profileImage ? <img src={authorProfile.profileImage} alt=""/> : authorName.slice(0,2)}</button><div><div className="post-author-line"><b>{authorName}</b></div><span>{age(post.originalCreatedAt ?? post.createdAt)}</span></div><button className="feed-coin-button" onClick={()=>onCoin?.(post.coin)} aria-label={t("코인 피드")+": "+post.coin}><Coin symbol={post.coin}/></button></div>
    <p className="post-body">{post.content}</p>{post.image && <button className="post-image" onClick={() => onPhoto(post.image)} aria-label={t("피드 이미지 크게 보기")}><img loading="lazy" decoding="async" src={post.image} alt={t("피드 첨부 사진")}/></button>}
    {post.additionalImage&&<button className="post-image" onClick={()=>onPhoto(post.additionalImage)} aria-label={t('추가 사진 크게 보기')}><img loading="lazy" decoding="async" src={post.additionalImage} alt={t('피드 추가 사진')}/></button>}
    {post.pinId && (nearViewport ? <AttachedPin id={post.pinId} onPin={onPin} onProfile={onProfile} onPhoto={onPhoto}/> : <div className="attached-pin-placeholder" aria-hidden="true"/>)}
    <button type="button" className="battle-meter feed-battle-meter" aria-label={t("지지 점수 · 배틀 참여자 순위")} onClick={()=>setRanking(true)}><i style={{width:`${total ? post.support / total * 100 : 50}%`}}/><span>{t("지지")} {formatCompactNumber(post.support)}</span><span className="meter-total" title={t("총점 {0} · 절대점수 {1}",score.toLocaleString(),total.toLocaleString())}><strong className={score === 0 ? "zero" : score < 0 ? "negative" : "positive"}>{score > 0 ? "+" : score < 0 ? "-" : ""}{formatCompactNumber(Math.abs(score))}</strong> <span className="meter-volume">±{formatCompactNumber(total)}</span></span><span>{t("반대")} {formatCompactNumber(post.oppose)}</span></button>
    <div className="score-row"><button className="battle-btn" onClick={() => onBattle(post)}><Swords/>{t("배틀")}</button><div className="card-actions"><button aria-pressed={activeCommentId === post.id} onClick={() => onComment(post)} aria-label={t("댓글 {0}", shownCount ?? '')}><MessageCircle/>{shownCount == null ? t("댓글") : formatCompactNumber(shownCount)}</button><button disabled={busy} aria-pressed={isShared} aria-label={repostNavigates && isShared ? t("내 리포스트 보기") : isShared ? t("리포스트 취소") : t("리포스트")} onClick={() => onRepost(post)}><Repeat2/>{formatCompactNumber(post.repostCount ?? shared.length)}</button><LikeButton post={post} liked={liked} count={likeCount} onLike={onLike}/></div></div>
    {ranking&&<BattleRankings key={`${post.id}:${me?.id||'guest'}`} postId={post.id} me={me} onClose={()=>setRanking(false)} onProfile={onProfile}/>}
    {menu&&own&&<Modal title={t('피드 관리')} onClose={()=>{if(!managing)setMenu(false);}} floating><div className="app-select-options"><button disabled={managing} onClick={()=>manage(()=>onPinProfile(post))}><Pin size={18}/><span>{t(post.originalPostId ? (pinnedRepostId===post.id?'리포스트 프로필 상단 고정 해제':'리포스트 프로필 상단 고정') : (pinnedPostId===post.id?'프로필 상단 고정 해제':'피드 내 프로필 상단에 고정'))}</span></button><button className="danger-text" disabled={managing} onClick={()=>manage(()=>post.originalPostId ? onCancelRepost(post) : onDelete(post))}><Trash2 size={18}/><span>{t(post.originalPostId ? '리포스트 피드 취소' : '피드 삭제하기')}</span></button></div></Modal>}
  </article>;
}

function LikeButton({post, liked, count, onLike}) {
  const [pending, setPending] = useState(false), locked = useRef(false);
  const { notify } = useFeedback();
  return <button type="button" className="like-button" aria-pressed={liked} aria-label={t(liked ? '좋아요 취소, {0}개' : '좋아요, {0}개', count)} disabled={pending} onClick={async () => {
    if (locked.current) return;
    locked.current = true; setPending(true);
    try { await onLike(post, !liked); }
    catch { void notify(t('좋아요를 저장하지 못했습니다. 다시 시도해 주세요.'), {kind:'error'}); }
    finally { locked.current = false; setPending(false); }
  }}><Heart fill={liked ? 'currentColor' : 'none'}/><span>{formatCompactNumber(count)}</span></button>;
}
