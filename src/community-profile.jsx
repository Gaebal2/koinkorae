import { t } from './language.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PagedPosts, PagedOwnComments, useCursorPage } from './paged-feed.jsx';
import { Trophy, FileText, Repeat2, Users, MapPin, MessageCircle, Pin } from 'lucide-react';
import { PointsPolicy } from './points-policy.jsx';
import { data } from './data.js';
import { age } from './api.js';
import { Empty, Modal, PinDetailCard, profileImage } from './ui.jsx';
import { useAppMessage } from './feedback.jsx';
import { CommunityPost, useFeedActions } from './community-feed.jsx';
import { relationshipsFor, tierFor } from './community-model.js';
import { useLiveProfile } from './live-profile.js';

function Person({person,me,following,onFollow,onProfile}) {
  const live=useLiveProfile(person.id), shown=live || person;
  return <div><button className="person-profile" onClick={() => onProfile(person.id)}><img src={shown.profileImage || profileImage()} alt=""/><span><b>{shown.username}</b><small>{shown.bio}</small></span></button>{person.id !== me?.id && <button onClick={() => onFollow(person.id)}>{following.includes(person.id) ? t("팔로잉 취소") : t("팔로우")}</button>}</div>;
}
function People({ ids, me, following, onFollow, onProfile }) {
  const [people, setPeople] = useState(null), [, setError] = useAppMessage();
  useEffect(() => { let active = true; setPeople(null); (data.profiles ? data.profiles(ids) : Promise.all(ids.map(id => data.profile(id)))).then(rows => { if (active) setPeople(rows.filter(Boolean)); }).catch(() => { if (active) { setPeople([]); setError('사용자 목록을 불러오지 못했습니다.'); } }); return () => { active = false; }; }, [ids.join(',')]);
  return people === null ? <p role="status">{t("불러오는 중…")}</p> : !people.length ? <Empty text={t("아직 사용자가 없습니다")}/> : <div className="people-list">{people.map(person => <Person key={person.id} person={person} me={me} following={following} onFollow={onFollow} onProfile={onProfile}/>)}</div>;
}

function ProfileContent({ onCoin, initialFeed = '작성 피드', onPin, profileId, profile, me, balance, pins, following, busy, login, onProfile, onEdit, onLogout, onFollow, onMap, onPinEdit, onPinDelete }) {
  const [posts, setPosts] = useState([]), [loaded, setLoaded] = useState(false), [edges, setEdges] = useState([]), [view, setView] = useState(null), [feed, setFeed] = useState(initialFeed), [photo, setPhoto] = useState(null), [comments, setComments] = useState(null);
  const feedStart = useRef(null), scrollPending = useRef(initialFeed === '리포스트'), scrollFrame = useRef(null);
  const showLatestRepost = useCallback(() => {
    if (!scrollPending.current || !feedStart.current) return;
    scrollPending.current = false;
    scrollFrame.current = requestAnimationFrame(() => feedStart.current?.scrollIntoView({block:'start',behavior:'instant'}));
  }, []);
  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);
  const [, setError] = useAppMessage();
  const [policy, setPolicy] = useState(false);
  const pinnedId=feed==='작성 피드'?profile?.pinnedPostId:feed==='리포스트'?profile?.pinnedRepostId:null;
  const pinnedPage=useCursorPage({mode:'profilePin',profileId,feed:feed==='리포스트'?'reposts':'posts'},me?.id,!!data.page && !!pinnedId);
  const pinnedPost=pinnedPage.items[0];
  const { actions, overlays } = useFeedActions(me, login, undefined, !!data.page);
  actions.onCoin=onCoin;
  const [authored, setAuthored] = useState([]), [sharedPosts, setSharedPosts] = useState([]);
  useEffect(() => { setAuthored([]); if(data.page)return; return data.watchAuthorPosts(profileId, setAuthored, () => setError('작성한 피드를 불러오지 못했습니다.')); }, [profileId]);
  const sharedIds = actions.reposts.filter(r => r.userId === profileId).sort((a,b) => b.createdAt-a.createdAt).map(r => r.postId).join(',');
  useEffect(() => { if(data.page)return; let active = true; setSharedPosts([]); data.postsById(sharedIds ? sharedIds.split(',') : []).then(rows => { if (active) setSharedPosts(rows); }).catch(() => { if (active) setError('리포스트 원문을 불러오지 못했습니다.'); }); return () => { active = false; }; }, [sharedIds, profileId, posts]);
  useEffect(() => { if(data.page){setLoaded(true);return;} return data.watchPosts(rows => { setPosts(rows); setLoaded(true); }, () => { setLoaded(true); setError('피드를 불러오지 못했습니다.'); }); }, []);
  useEffect(() => data.watchRelationships(setEdges, () => setError('팔로우 정보를 불러오지 못했습니다.'),profileId), [profileId]);
  useEffect(() => { setView(null); setFeed(initialFeed); scrollPending.current = initialFeed === '리포스트'; }, [profileId, initialFeed]);
  useEffect(() => {
    if (data.page || feed !== '내 댓글' || !me || profileId !== me.id) return;
    let active = true; setComments(null);
    data.ownComments().then(rows => { if (active) setComments(rows); }).catch(error => { console.warn('Profile comment history:', error.code || error.name, error.message); if (active) { setComments([]); setError('댓글을 불러오지 못했습니다.'); } });
    return () => { active = false; };
  }, [feed, me?.id, profileId, posts]);
  useEffect(() => { if (!data.page && loaded && profile && feed === initialFeed) showLatestRepost(); }, [loaded, profile, feed, initialFeed, showLatestRepost]);
  if (!profileId) return <main><section className="profile-head"><img className="profile-avatar" src={profileImage()} alt={t("앱 아이콘")}/><h1>{t("나의 프로필")}</h1><p>{t("로그인하고 피드와 거래 정보를 관리하세요.")}</p><button className="primary" onClick={login}>{t("Google 로그인")}</button></section></main>;
  if (!profile) return <main><p className="loading-state" role="status">{t("프로필을 불러오는 중…")}</p></main>;
  const own = profileId === me?.id, graph = relationshipsFor(edges, profileId), tier = tierFor(balance.lifetime), mine = pins.filter(p => p.ownerId === profileId);
  const shown = feed === '작성 피드' ? authored : sharedPosts;
  const peopleIds = { '팔로워': graph.followers, '팔로잉': graph.following, '맞팔친구': graph.friends };
  return <main className="profile-page-x"><section className="profile-head"><img className="profile-avatar" src={profile.profileImage || profileImage()} alt={t("{0} 프로필", profile.username)}/><div className="profile-name-row"><h1>{profile.username}</h1>{!own && <button disabled={busy} onClick={() => onFollow(profileId)}>{following.includes(profileId) ? t("팔로잉 취소") : t("팔로우")}</button>}</div><p>{profile.bio || t("내 주변에서 코인 이야기를 나누세요.")}</p><div className="profile-social"><button onClick={() => setView('팔로워')}><b>{graph.followers.length}</b> {t("팔로워")}</button><button onClick={() => setView('팔로잉')}><b>{graph.following.length}</b> {t("팔로잉")}</button></div></section>
    {own ? <><button type="button" className="tier-card" onClick={() => setPolicy(true)} aria-haspopup="dialog"><Trophy/><div><small>{t("현재 등급 · 누적")}{balance.lifetime.toLocaleString()} BP</small><b>{tier.tier}</b><span>{t("보유")}{balance.current.toLocaleString()} BP · PIN {mine.length}/3</span><span>{tier.next ? t("다음 등급까지 {0} BP", Math.max(0,tier.next-balance.lifetime).toLocaleString()) : t("최고 등급입니다")}</span></div><i style={{width:`${tier.progress}%`}}/></button></> : null}
    <div ref={feedStart} className="profile-menu-box" style={{scrollMarginTop:80}}><div className="segments profile-content-tabs" role="tablist" aria-label={t("프로필")}>{[['작성 피드',FileText],['리포스트',Repeat2],['맞팔친구',Users],['PIN',MapPin],...(own?[['내 댓글',MessageCircle]]:[])].map(([label,Icon])=><button key={label} type="button" role="tab" aria-selected={feed===label} aria-controls="profile-content-panel" aria-label={t(label)} title={t(label)} className={feed===label?'active':''} onClick={()=>setFeed(label)}><Icon aria-hidden="true"/></button>)}</div><h2 className="profile-feed-title" aria-live="polite"><span>{t(feed)}</span></h2></div>
    <section id="profile-content-panel" role="tabpanel" aria-label={t(feed)}>
    {['작성 피드','리포스트'].includes(feed) ? <div className="feed">{pinnedPost&&<section className="profile-pinned-feed" aria-label={t('프로필 상단 고정')}><div className="profile-pinned-marker"><Pin size={20} aria-hidden="true"/><span>{t('상단 고정')}</span></div><CommunityPost post={pinnedPost} onPin={onPin} onProfile={onProfile} {...actions}/><hr className="profile-pinned-divider"/></section>}{data.page ? <PagedPosts excludeId={pinnedPost?.id} onReady={feed === initialFeed ? showLatestRepost : undefined} options={{mode:"posts",category:"최신",...(feed === "작성 피드" ? {author:profileId} : {repostedBy:profileId})}} me={me} onPin={onPin} onProfile={onProfile} actions={actions}/> : !loaded ? <p role="status">{t("피드를 불러오는 중…")}</p> : shown.length ? shown.filter(post=>post.id!==pinnedPost?.id).map(post => <CommunityPost onPin={onPin} key={post.id} post={post} onProfile={onProfile} {...actions}/>) : <Empty text={feed === '작성 피드' ? t("아직 작성한 피드가 없습니다") : t("아직 리포스트가 없습니다")}/>}</div> : feed==='맞팔친구' ? <People ids={graph.friends} me={me} following={following} onFollow={onFollow} onProfile={onProfile}/> : feed==='PIN' ? <div className="profile-pin-list">{mine.length ? mine.map(pin => <div key={pin.id}><PinDetailCard pin={pin} className="profile-pin-card" onProfile={() => { setView(null); onProfile(pin.ownerId); }} onImage={p => setPhoto(p.image)} onEdit={pin.owner ? onPinEdit : undefined} onDelete={pin.owner ? onPinDelete : undefined} footer={<button className="profile-pin-map" onClick={() => { setView(null); onMap(pin); }}>{t("지도에서 보기")}</button>}/></div>) : <Empty text={t("등록한 PIN이 없습니다")}/>}</div> : data.page ? <PagedOwnComments me={me} onComment={actions.onComment}/> : <div className="profile-comments">{comments === null ? <p role="status">{t("댓글을 불러오는 중…")}</p> : comments.length ? comments.map(comment => <article key={`${comment.post.id}_${comment.id}`}><b>{comment.post.author} · {comment.post.coin}</b><small>{age(comment.createdAt)}</small><p>{comment.content}</p><button className="text-action" onClick={() => actions.onComment(comment.post)}>{t("원문과 댓글 보기")}</button></article>) : <Empty text={t("아직 작성한 댓글이 없습니다")}/>}</div>}
    </section>
    {view && <Modal title={view} onClose={()=>setView(null)}><People ids={peopleIds[view]} me={me} following={following} onFollow={onFollow} onProfile={id=>{setView(null);onProfile(id);}}/></Modal>}
    {policy && <PointsPolicy onClose={() => setPolicy(false)}/>}
    {photo && <Modal title={t("거래 사진")} onClose={() => setPhoto(null)}><img className="expanded-photo" src={photo} alt={t("거래 첨부 사진")}/></Modal>}{overlays}
  </main>;
}

export function CommunityProfile(props) {
  if (!props.me || !props.profileId) return <main><section className="profile-head"><img className="profile-avatar" src={profileImage()} alt={t("앱 아이콘")}/><h1>{t("나의 프로필")}</h1><p>{t("로그인하고 프로필을 확인하세요.")}</p><button className="primary" onClick={props.login}>{t("로그인")}</button></section></main>;
  return <ProfileContent {...props}/>;
}
