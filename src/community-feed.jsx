import React, { useEffect, useState } from 'react';
import { MapPin, MessageCircle, Repeat2, Swords } from 'lucide-react';
import { data } from './data.js';
import { age } from './api.js';
import { Coin, Modal } from './ui.jsx';
import { useAppMessage, useFeedback } from './feedback.jsx';
import { BattleGames } from './battle-games.jsx';
import { Comments } from './social.jsx';

export function useFeedActions(me, login) {
  const { confirm, notify } = useFeedback();
  const [, setError] = useAppMessage();
  const [battle, setBattle] = useState(null), [comments, setComments] = useState(null), [photo, setPhoto] = useState(null), [reposts, setReposts] = useState([]), [busy, setBusy] = useState(false);
  useEffect(() => data.watchReposts(setReposts, () => setError('리포스트를 불러오지 못했습니다.')), []);
  const actions = {
    me, reposts, busy, onBattle: setBattle, onComment: setComments, onPhoto: setPhoto,
    onRepost: async post => {
      if (!me) { login(); return; }
      if (busy) return;
      setBusy(true);
      try { await data.repost(post.id, !reposts.some(r => r.postId === post.id && r.userId === me.id)); }
      catch { setError('리포스트를 저장하지 못했습니다.'); }
      finally { setBusy(false); }
    },
    onDelete: async post => {
      if (!(await confirm('이 게시물을 삭제할까요? 삭제 후에는 복구할 수 없습니다.', {title:'게시물 삭제',confirmLabel:'삭제'}))) return;
      try { await data.deletePost(post.id); void notify('게시물을 삭제했습니다.', {kind:'success',title:'삭제 완료'}); }
      catch { setError('게시물을 삭제하지 못했습니다.'); }
    },
  };
  const overlays = <>{battle && <BattleGames post={battle} onClose={() => setBattle(null)}/ >}{comments && <Comments post={comments} me={me} close={() => setComments(null)}/ >}{photo && <Modal title="피드 사진" onClose={() => setPhoto(null)}><img className="expanded-photo" src={photo} alt="피드 첨부 사진 확대"/></Modal>}</>;
  return { actions, overlays };
}

export function CommunityPost({ onPin, post, rank, onProfile, me, reposts, busy, onBattle, onComment, onRepost, onPhoto, onDelete }) {
  const [count, setCount] = useState(null);
  useEffect(() => { setCount(null); return data.watchCommentCount(post.id, setCount, () => setCount(null)); }, [post.id]);
  const total = post.support + post.oppose, score = post.support - post.oppose;
  const shared = reposts.filter(r => r.postId === post.id), isShared = shared.some(r => r.userId === me?.id);
  return <article className="post-card">
    <div className="post-head"><button className="avatar tone-purple" onClick={() => onProfile(post.authorId)} aria-label={`${post.author} 프로필 보기`}>{post.author.slice(0,2)}</button><div><b>{post.author}</b><span>{age(post.createdAt)}</span></div>{rank && <span className="rank">#{rank}</span>}<Coin symbol={post.coin}/></div>
    <p className="post-body">{post.content}</p>{post.image && <button className="post-image" onClick={() => onPhoto(post.image)} aria-label="피드 이미지 크게 보기"><img src={post.image} alt="피드 첨부 사진"/></button>}
    {post.pinId && <button className="post-pin-link" onClick={() => onPin?.(post.pinId)}><MapPin/>첨부 Pin 지도에서 보기</button>}
    <div className="battle-meter"><i style={{width:`${total ? post.support / total * 100 : 50}%`}}/><span>지지 {post.support.toLocaleString()}</span><span>반대 {post.oppose.toLocaleString()}</span></div>
    <div className="score-row"><div><small>노출 점수</small><strong className={score < 0 ? 'negative' : ''}>{score > 0 ? '+' : ''}{score.toLocaleString()}</strong></div><div className="card-actions"><button onClick={() => onComment(post)} aria-label={`댓글 ${count ?? ''}`}><MessageCircle/>{count ?? '댓글'}</button><button disabled={busy} aria-pressed={isShared} aria-label={isShared ? '리포스트 취소' : '리포스트'} onClick={() => onRepost(post)}><Repeat2/>{shared.length}</button><button className="battle-btn" onClick={() => onBattle(post)}><Swords/>배틀</button></div></div>
    {post.authorId === me?.id && <button className="text-action danger-text" onClick={() => onDelete(post)}>내 글 삭제</button>}
  </article>;
}
