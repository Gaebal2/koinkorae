import { t } from './language.js';
import React, { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Repeat2, RepeatOff, Swords } from 'lucide-react';
import { data } from './data.js';
import { age } from './api.js';
import { Coin, Modal, PinDetailCard, profileImage } from './ui.jsx';
import { useAppMessage, useFeedback } from './feedback.jsx';
import { BattleGames } from './battle-games.jsx';
import { Comments } from './social.jsx';
import { useLiveProfile } from './live-profile.js';

export function useFeedActions(me, login, onReposted, enriched = false) {
  const { confirm, notify } = useFeedback();
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
    me, reposts, likes, busy, onCancelRepost: cancelRepost, repostNavigates: !!onReposted, onBattle: post => me ? setBattle(post) : login(), onComment: setComments, onPhoto: setPhoto,
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

export function CommunityPost({ onPin, post, onProfile, me, reposts, likes = [], busy, repostNavigates, onBattle, onComment, onRepost, onCancelRepost, onLike, onPhoto, onDelete }) {
  const element = useRef(null);
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    if (!globalThis.IntersectionObserver) { setNearViewport(true); return; }
    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), { rootMargin: '300px' });
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
    <div className="post-head"><button className="avatar tone-purple" onClick={() => onProfile(post.authorId)} aria-label={t("{0} 프로필 보기", authorName)}>{authorProfile?.profileImage ? <img src={authorProfile.profileImage} alt=""/> : authorName.slice(0,2)}</button><div><b>{authorName}</b><span>{age(post.originalCreatedAt ?? post.createdAt)}</span></div><Coin symbol={post.coin}/></div>
    {post.originalPostId && <div className="repost-context"><div className="repost-context-heading">{post.repostAuthorId === me?.id ? <button type="button" className="repost-badge" aria-label={t('리포스트 취소')} disabled={busy} onClick={() => onCancelRepost(post)}><RepeatOff size={16}/></button> : <span className="repost-badge" aria-hidden="true"><Repeat2 size={16}/></span>}<button onClick={() => onProfile(post.repostAuthorId)}><img src={post.repostProfile?.profileImage || profileImage()} alt=""/><b>{post.repostProfile?.username || t('사용자')}</b></button><span>{t('리포스트')} · {age(post.createdAt)}</span></div>{post.repostComment && <p>{post.repostComment}</p>}</div>}
    <p className="post-body">{post.content}</p>{post.image && <button className="post-image" onClick={() => onPhoto(post.image)} aria-label={t("피드 이미지 크게 보기")}><img src={post.image} alt={t("피드 첨부 사진")}/></button>}
    {post.pinId && (nearViewport ? <AttachedPin id={post.pinId} onPin={onPin} onProfile={onProfile} onPhoto={onPhoto}/> : <div className="attached-pin-placeholder" aria-hidden="true"/>)}
    <div className="battle-meter"><i style={{width:`${total ? post.support / total * 100 : 50}%`}}/><span>{t("지지")} {post.support.toLocaleString()}</span><span>{t("반대")} {post.oppose.toLocaleString()}</span></div>
    <div className="score-row"><div><small>{t("지지 점수")}</small><strong className={score < 0 ? 'negative' : ''}>{score > 0 ? '+' : ''}{score.toLocaleString()}</strong></div><div className="card-actions"><button onClick={() => onComment(post)} aria-label={t("댓글 {0}", shownCount ?? '')}><MessageCircle/>{shownCount ?? t("댓글")}</button><button disabled={busy} aria-pressed={isShared} aria-label={repostNavigates && isShared ? t("내 리포스트 보기") : isShared ? t("리포스트 취소") : t("리포스트")} onClick={() => onRepost(post)}><Repeat2/>{post.repostCount ?? shared.length}</button><LikeButton post={post} liked={liked} count={likeCount} onLike={onLike}/><button className="battle-btn" onClick={() => onBattle(post)}><Swords/>{t("배틀")}</button></div></div>
    {(post.repostAuthorId || post.authorId) === me?.id && <button className="text-action danger-text" onClick={() => onDelete(post)}>{t("내 글 삭제")}</button>}
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
  }}><Heart fill={liked ? 'currentColor' : 'none'}/><span>{count}</span></button>;
}
