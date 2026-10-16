import React from 'react';
import {MessageCircle,ArrowUpRight} from 'lucide-react';
import {Coin} from './ui.jsx';
import {age} from './api.js';
import {t} from './language.js';
export function OwnCommentCard({comment,onComment}) {
 const post=comment.post;
 return <article className="own-comment-card">
  <header className="own-comment-heading"><span className="own-comment-icon"><MessageCircle size={17}/></span><b>{t('남긴 댓글')}</b><time dateTime={Number.isFinite(comment.createdAt)?new Date(comment.createdAt).toISOString():undefined}>{age(comment.createdAt)}</time></header>
  <p className="own-comment-body">{comment.content}</p>
  <button type="button" className="own-comment-source" onClick={()=>onComment(post)} aria-label={t('원문과 댓글 보기')}>
   <Coin symbol={post.coin}/><span><b>{post.author} <small>· {post.coin}</small></b><span>{post.content||t('원문과 댓글 보기')}</span></span><ArrowUpRight size={18}/>
  </button>
 </article>;
}
