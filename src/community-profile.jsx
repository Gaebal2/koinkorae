import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { data } from './data.js';
import { age } from './api.js';
import { Empty, Modal, PinDetailCard, profileImage, Segments } from './ui.jsx';
import { useAppMessage } from './feedback.jsx';
import { CommunityPost, useFeedActions } from './community-feed.jsx';
import { coinRanks, relationshipsFor, tierFor } from './community-model.js';
import { useBackDismiss } from './use-back-dismiss.js';

function People({ ids, me, following, onFollow, onProfile }) {
  const [people, setPeople] = useState(null), [, setError] = useAppMessage();
  useEffect(() => { let active = true; setPeople(null); Promise.all(ids.map(id => data.profile(id))).then(rows => { if (active) setPeople(rows.filter(Boolean)); }).catch(() => { if (active) { setPeople([]); setError('사용자 목록을 불러오지 못했습니다.'); } }); return () => { active = false; }; }, [ids.join(',')]);
  return people === null ? <p role="status">불러오는 중…</p> : !people.length ? <Empty text="아직 사용자가 없습니다"/> : <div className="people-list">{people.map(person => <div key={person.id}><button className="person-profile" onClick={() => onProfile(person.id)}><img src={person.profileImage || profileImage()} alt=""/><span><b>{person.username}</b><small>{person.bio}</small></span></button>{person.id !== me?.id && <button onClick={() => onFollow(person.id)}>{following.includes(person.id) ? '팔로잉 취소' : '팔로우'}</button>}</div>)}</div>;
}

export function CommunityProfile({ initialFeed = '작성 피드', onPin, profileId, profile, me, balance, pins, following, busy, login, onProfile, onEdit, onLogout, onFollow, onMap, onPinEdit, onPinDelete }) {
  const [posts, setPosts] = useState([]), [loaded, setLoaded] = useState(false), [edges, setEdges] = useState([]), [view, setView] = useState(null), [feed, setFeed] = useState('작성 피드'), [photo, setPhoto] = useState(null), [comments, setComments] = useState(null);
  const [, setError] = useAppMessage();
  const { actions, overlays } = useFeedActions(me, login);
  const [authored, setAuthored] = useState([]), [sharedPosts, setSharedPosts] = useState([]);
  useEffect(() => { setAuthored([]); return data.watchAuthorPosts(profileId, setAuthored, () => setError('작성한 피드를 불러오지 못했습니다.')); }, [profileId]);
  const sharedIds = actions.reposts.filter(r => r.userId === profileId).sort((a,b) => b.createdAt-a.createdAt).map(r => r.postId).join(',');
  useEffect(() => { let active = true; setSharedPosts([]); data.postsById(sharedIds ? sharedIds.split(',') : []).then(rows => { if (active) setSharedPosts(rows); }).catch(() => { if (active) setError('리포스트 원문을 불러오지 못했습니다.'); }); return () => { active = false; }; }, [sharedIds, profileId, posts]);
  useEffect(() => data.watchPosts(rows => { setPosts(rows); setLoaded(true); }, () => { setLoaded(true); setError('피드를 불러오지 못했습니다.'); }), []);
  useEffect(() => data.watchRelationships(setEdges, () => setError('팔로우 정보를 불러오지 못했습니다.')), []);
  useEffect(() => { setView(null); setFeed(initialFeed); }, [profileId, initialFeed]);
  useBackDismiss(!!view, () => setView(null));
  useEffect(() => {
    if (view !== '댓글' || !me || profileId !== me.id) return;
    let active = true; setComments(null);
    data.ownComments().then(rows => { if (active) setComments(rows); }).catch(error => { console.warn('Profile comment history:', error.code || error.name, error.message); if (active) { setComments([]); setError('댓글을 불러오지 못했습니다.'); } });
    return () => { active = false; };
  }, [view, me?.id, profileId, posts]);
  if (!profileId) return <main><section className="profile-head"><img className="profile-avatar" src={profileImage()} alt="앱 아이콘"/><h1>나의 프로필</h1><p>로그인하고 피드와 거래 정보를 관리하세요.</p><button className="primary" onClick={login}>Google 로그인</button></section></main>;
  if (!profile) return <main><p className="loading-state" role="status">프로필을 불러오는 중…</p></main>;
  const own = profileId === me?.id, graph = relationshipsFor(edges, profileId), tier = tierFor(balance.lifetime), mine = pins.filter(p => p.ownerId === profileId), ranks = coinRanks(posts);
  const shown = feed === '작성 피드' ? authored : sharedPosts;
  const peopleIds = { '팔로워': graph.followers, '팔로잉': graph.following, '친구': graph.friends };
  return <main className="profile-page-x"><section className="profile-head"><img className="profile-avatar" src={profile.profileImage || profileImage()} alt={`${profile.username} 프로필`}/><h1>{profile.username}</h1><p>{profile.bio || '내 주변에서 코인 이야기를 나누세요.'}</p><div className="profile-social"><button onClick={() => setView('팔로워')}><b>{graph.followers.length}</b> 팔로워</button><button onClick={() => setView('팔로잉')}><b>{graph.following.length}</b> 팔로잉</button></div></section>
    {own ? <><section className="tier-card"><Trophy/><div><small>현재 등급 · 누적 {balance.lifetime.toLocaleString()} BP</small><b>{tier.tier}</b><span>보유 {balance.current.toLocaleString()} BP · PIN {mine.length}/3</span><span>{tier.next ? `다음 등급까지 ${Math.max(0,tier.next-balance.lifetime).toLocaleString()} BP` : '최고 등급입니다'}</span></div><i style={{width:`${tier.progress}%`}}/></section><div className="profile-links"><button onClick={onEdit}>프로필 수정</button><button disabled={busy} onClick={onLogout}>로그아웃</button></div></> : <div className="profile-links"><button disabled={busy} onClick={() => onFollow(profileId)}>{following.includes(profileId) ? '팔로잉 취소' : '팔로우'}</button></div>}
    <div className="profile-links"><button onClick={() => setView('친구')}>친구 {graph.friends.length}</button><button onClick={() => setView('PIN')}>PIN {mine.length}</button>{own && <button onClick={() => setView('댓글')}>내 댓글</button>}</div>
    <h2 className="profile-feed-title">{own ? '내 Feed' : `${profile.username}님의 Feed`}</h2><Segments items={['작성 피드','리포스트']} value={feed} onChange={setFeed}/><div className="feed">{!loaded ? <p role="status">피드를 불러오는 중…</p> : shown.length ? shown.map(post => <CommunityPost onPin={onPin} key={post.id} post={post} rank={ranks.get(post.coin)} onProfile={onProfile} {...actions}/>) : <Empty text={feed === '작성 피드' ? '아직 작성한 피드가 없습니다' : '아직 리포스트가 없습니다'}/>}</div>
    {view && <Modal title={view} onClose={() => setView(null)}>{peopleIds[view] ? <People ids={peopleIds[view]} me={me} following={following} onFollow={onFollow} onProfile={id => { setView(null); onProfile(id); }}/> : view === 'PIN' ? <div className="profile-pin-list">{mine.length ? mine.map(pin => <div key={pin.id}><PinDetailCard pin={pin} className="profile-pin-card" onProfile={() => { setView(null); onProfile(pin.ownerId); }} onImage={p => setPhoto(p.image)} onEdit={pin.owner ? onPinEdit : undefined} onDelete={pin.owner ? onPinDelete : undefined}/><button className="secondary" onClick={() => { setView(null); onMap(pin); }}>지도에서 보기</button></div>) : <Empty text="등록한 PIN이 없습니다"/>}</div> : <div className="profile-comments">{comments === null ? <p role="status">댓글을 불러오는 중…</p> : comments.length ? comments.map(comment => <article key={`${comment.post.id}_${comment.id}`}><b>{comment.post.author} · {comment.post.coin}</b><small>{age(comment.createdAt)}</small><p>{comment.content}</p><button className="text-action" onClick={() => actions.onComment(comment.post)}>원문과 댓글 보기</button></article>) : <Empty text="아직 작성한 댓글이 없습니다"/>}</div>}</Modal>}
    {photo && <Modal title="거래 사진" onClose={() => setPhoto(null)}><img className="expanded-photo" src={photo} alt="거래 첨부 사진"/></Modal>}{overlays}
  </main>;
}
