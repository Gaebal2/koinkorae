import { useAppMessage, useFeedback } from './feedback.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck, Check, Home, Map as MapIcon, MapPinPlus, Shield, SquarePen, Swords, Trophy, X, Zap, ChevronDown, ChevronUp, CircleUserRound } from 'lucide-react';
import L from 'leaflet';
import { api, age, presentationPost, readPhoto } from './api.js';
import { Header, Segments, PostCard, Coin, PinDetailCard, PinForm, Composer, Modal, Field, PageTitle, Empty, InstallPrompt, coinColor, profileImage } from './ui.jsx';

function useResource(loader, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true, error: '' });
    loader().then(data => { if (alive) setState({ data, loading: false, error: '' }); }, error => { if (alive) setState({ data: null, loading: false, error: error.message }); });
    return () => { alive = false; };
  }, deps);
  return state;
}
function Status({ loading, error, retry }) {
  const [, showError] = useAppMessage();
  useEffect(() => { showError(error); }, [error, showError]);
  if (loading) return <p className="loading-state" role="status">불러오는 중…</p>;
  if (error) return <div className="connection-error" role="alert"><p>{error}</p><button className="secondary" onClick={retry}>다시 시도</button></div>;
  return null;
}
function Auth({ onClose, onLogin }) {
  const [mode, setMode] = useState('로그인'), [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useAppMessage();
  return <Modal title={mode} onClose={onClose}><form onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { const user = await api(`/auth/${mode === '로그인' ? 'login' : 'register'}`, 'POST', { username, password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); onLogin(user); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }}>
    <p className="form-help">계정으로 로그인하면 피드와 활동, BP를 이어서 사용할 수 있어요.</p>
    <Field label="사용자 이름"><input required autoComplete="username" minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" value={username} onChange={e => setUsername(e.target.value)} placeholder="영문·숫자·밑줄 3~24자"/></Field>
    <Field label="비밀번호"><input required type="password" minLength={mode === '회원가입' ? 10 : 1} maxLength={128} autoComplete={mode === '회원가입' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="10자 이상"/></Field>
    {error && <p role="alert" className="error">{error}</p>}
    <button className="primary" disabled={busy}>{busy ? '확인 중…' : mode}</button>
    <button type="button" className="secondary" onClick={() => { setMode(mode === '로그인' ? '회원가입' : '로그인'); setError(''); }}>{mode === '로그인' ? '처음이신가요? 회원가입' : '이미 계정이 있어요'}</button>
  </form></Modal>;
}
function Feed({ options, setOptions, revision, refresh, actions, compose, me }) {
  const { feed, category, period } = options;
  const zone = me?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const resource = useResource(() => api(`/posts?${new URLSearchParams({ category, period, zone })}`), [category, period, zone, revision, me?.id]);
  const [open, setOpen] = useState({});
  const data = resource.data;
  const ranks = new Map(data?.groups.map(g => [g.coin, g.rank]));
  const renderPost = p => <PostCard key={p.id} post={presentationPost(p)} rank={ranks.get(p.coin)} {...actions}/>;
  return <main className="home-page">
    <div className="feed-controls"><div className="feed-toggle"><Segments items={['유저 피드', '코인 피드']} value={feed} onChange={feed => setOptions({ ...options, feed })}/></div><div className="filters"><Segments compact items={['노출', '최신', '팔로잉', '급상승', '논쟁']} value={category} onChange={category => setOptions({ ...options, category })}/><span className="filter-divider"/><Segments compact items={['오늘', '이번 달', '올해', '전체']} value={period} onChange={period => setOptions({ ...options, period })}/></div></div>
    <Status {...resource} retry={refresh}/>
    {data && !data.posts.length && <Empty text={category === '팔로잉' ? '팔로우한 사용자의 피드가 없습니다' : '선택한 기간의 피드가 없습니다'}/>}
    {data && (feed === '유저 피드' ? <div className="feed">{data.posts.map(renderPost)}</div> : data.groups.map(group => <section className="coin-group" key={group.coin}>
      <button className="coin-group-head" aria-expanded={!!open[group.coin]} onClick={() => setOpen({ ...open, [group.coin]: !open[group.coin] })}><Coin symbol={group.coin}/><div><b>#{group.rank} {group.coin}</b><small>{category === '최신' ? `최근 게시 ${age(group.score)}` : `${category} 점수 ${Math.round(group.score).toLocaleString()}`}</small></div>{open[group.coin] ? <ChevronUp/> : <ChevronDown/>}</button>
      {open[group.coin] && group.items.map(renderPost)}
    </section>))}
    <button className="fab" onClick={compose} aria-label="새 피드 작성"><SquarePen/></button>
  </main>;
}
function Comments({ post, onClose, me, login, refresh }) {
  const [revision, setRevision] = useState(0), [content, setContent] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useAppMessage();
  const resource = useResource(() => api(`/posts/${post.id}/comments`), [post.id, revision]);
  return <Modal title="피드와 댓글" onClose={onClose}><p className="post-body">{post.content}</p><Status {...resource} retry={() => setRevision(x => x + 1)}/><div className="comment-list">{resource.data?.map(comment => <article key={comment.id}><b>@{comment.author}</b><small>{age(comment.created_at)}</small><p>{comment.content}</p></article>)}{resource.data?.length === 0 && <p className="form-help">첫 댓글을 남겨보세요.</p>}</div><form onSubmit={async event => {
    event.preventDefault(); if (!me) { login(); return; } setBusy(true); setError('');
    try { await api(`/posts/${post.id}/comments`, 'POST', { content }); setContent(''); setRevision(x => x + 1); refresh(); } catch (error) { setError(error.message); } finally { setBusy(false); }
  }}><Field label="댓글"><textarea maxLength={1000} required value={content} onChange={e => setContent(e.target.value)}/></Field>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy || !content.trim()}>{me ? '댓글 게시' : '로그인 후 댓글 작성'}</button></form></Modal>;
}
function Battle({ post, me, config, onClose, onUpdated }) {
  const [session, setSession] = useState(null), [elapsed, setElapsed] = useState(0), [count, setCount] = useState(0), [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useAppMessage();
  const trace = useRef([]), started = useRef(0), requestKey = useRef(null), startLocked = useRef(false), inputLocked = useRef(false);
  const [side, setSide] = useState(null);
  useEffect(() => {
    if (!session) return;
    let frame;
    const tick = () => { const value = Math.min(session.challenge.duration, performance.now() - started.current); setElapsed(value); if (value < session.challenge.duration) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [session]);
  const start = async selected => {
    if (startLocked.current) return; startLocked.current = true; setBusy(true); setError(''); setSide(selected);
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try { const value = await api('/battle/start', 'POST', { postId: post.id, repostId: post.repostId, side: selected, requestKey: requestKey.current });
      if (value.finished) throw Error('이미 종료한 게임입니다. 창을 닫고 다시 참여하세요.');
      started.current = performance.now(); trace.current = []; setSide(value.side); setSession(value); onUpdated();
    } catch (error) { setError(error.message); } finally { setBusy(false); startLocked.current = false; }
  };
  const tap = lane => {
    if (!session || inputLocked.current) return;
    const t = Math.round(performance.now() - started.current);
    if (t > session.challenge.duration || t - (trace.current.at(-1)?.t ?? -1000) < 70) return;
    trace.current.push({ t, lane }); setCount(trace.current.length);
  };
  const finish = async () => {
    if (busy) return; setBusy(true); setError(''); inputLocked.current = true;
    try { setResult(await api('/battle/finish', 'POST', { sessionId: session.id, trace: trace.current })); onUpdated(); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  const game = session?.challenge.game, duration = session?.challenge.duration || 1;
  const active = session?.challenge.targets.find(target => elapsed >= target.at && elapsed <= target.at + 900);
  const close = async () => {
    if (busy) return;
    if (session && !result) {
      setBusy(true);
      try { await api('/battle/cancel', 'POST', { sessionId: session.id }); onClose(); }
      catch (error) { setError(error.message); } finally { setBusy(false); }
    } else onClose();
  };
  return <Modal title="배틀 참여" onClose={close}>{!session ? <>
    <p className="battle-question">이 피드를 지지합니까? 반대합니까?</p>
    <div className="battle-explain"><span><Shield/>지지 점수는 노출 점수에 더해집니다.</span><span><Swords/>반대 점수는 노출 점수에서 빠집니다.</span></div>
    <p className="form-help">시작 시 {config.battleCost} BP를 사용합니다. 도중에 나가도 사용한 BP는 반환되지 않습니다. 게임은 무작위로 배정됩니다.</p>
    <div className="side-choice"><button disabled={busy || me.current_bp < config.battleCost} onClick={() => start('support')}>지지</button><button disabled={busy || me.current_bp < config.battleCost} onClick={() => start('oppose')}>반대</button></div>
    {me.current_bp < config.battleCost && <p className="error">BP가 부족합니다. 체크인으로 BP를 받아보세요.</p>}
  </> : <div className="minigame">
    <span className="game-label">{({ speed: '스피드 탭', timing: '타이밍 챌린지', reaction: '반응 속도' })[game]}</span>
    {result ? <><Trophy/><h2>{result.score}점 반영 완료</h2><p>{side === 'support' ? '지지' : '반대'} 점수에 반영했습니다.{post.repostId && ' 원본에도 같은 점수가 반영됩니다.'}</p><button className="primary" onClick={onClose}>완료</button></> : <>
      <div className="game-stats"><b>입력 {count}회</b><span>{Math.max(0, (duration - elapsed) / 1000).toFixed(1)}초</span></div>
      <p>{game === 'speed' ? '시간 안에 버튼을 빠르게 눌러주세요.' : game === 'timing' ? '진행 표시가 보라색 목표에 닿을 때 눌러주세요.' : '불이 켜진 버튼을 빠르게 눌러주세요.'}</p>
      <div className="game-timeline"><i style={{ width: `${elapsed / duration * 100}%` }}/>{game === 'timing' && session.challenge.targets.map(target => <span key={target.at} style={{ left: `${target.at / duration * 100}%` }}/>)}</div>
      {elapsed < duration ? game === 'reaction' ? <div className="reaction-buttons">{[0, 1, 2].map(lane => <button key={lane} className={active?.lane === lane ? 'lit' : ''} aria-label={`반응 버튼 ${lane + 1}`} onPointerDown={e => { e.preventDefault(); tap(lane); }} onKeyDown={e => { if (['Enter', ' '].includes(e.key) && !e.repeat) { e.preventDefault(); tap(lane); } }}>{active?.lane === lane ? '지금!' : lane + 1}</button>)}</div> : <button className="tap-target" onPointerDown={e => { e.preventDefault(); tap(0); }} onKeyDown={e => { if (['Enter', ' '].includes(e.key) && !e.repeat) { e.preventDefault(); tap(0); } }}>TAP!</button> : <button className="primary" disabled={busy} onClick={finish}>{busy ? '결과 확인 중…' : '결과 확인'}</button>}
    </>}
  </div>}{error && <p className="error" role="alert">{error}</p>}</Modal>;
}
function Checkin({ me, config, refresh, login }) {
  const [busy, setBusy] = useState(false), [error, setError] = useAppMessage();
  const check = async () => { if (!me) { login(); return; } setBusy(true); setError(''); try { await api('/checkin', 'POST'); await refresh(); } catch (error) { setError(error.message); } finally { setBusy(false); } };
  return <main><PageTitle icon={CalendarCheck} title="오늘의 BP" sub="참여에 필요한 Battle Point를 모으세요"/><section className="balance-card"><span>사용 가능한 BP</span><strong>{me?.current_bp ?? 0}</strong><small>Lifetime Earned · {(me?.lifetime_bp ?? 0).toLocaleString()} BP</small></section>
    <section className="check-card"><div className="calendar-mark"><CalendarCheck/></div><h2>{me?.checked ? '오늘 출석 완료!' : `매일 출석하고 +${config.checkinReward} BP`}</h2><p>{me?.checked ? '내일 다시 만나요.' : '꾸준한 참여로 커뮤니티 영향력을 키워보세요.'}</p><button className="primary" disabled={busy || me?.checked} onClick={check}>{me?.checked ? <><Check/>지급 완료</> : me ? <><Zap/>출석 체크</> : '로그인하고 출석하기'}</button></section>
    <section className="reward-row"><div><span>REWARDED AD</span><b>{config.adsEnabled ? `광고 보고 +${config.adReward} BP` : '광고 보상 준비 중'}</b><small>{config.adsEnabled ? `오늘 ${me?.adCount || 0}/${config.adDailyLimit}회 참여` : '광고 연결이 완료되면 이용할 수 있어요.'}</small></div><button disabled={!config.adsEnabled || busy || (me?.adCount || 0) >= config.adDailyLimit} onClick={async () => { if (!me) { login(); return; } setBusy(true); try { const ad = await api('/ads/start', 'POST'); if (!ad.url || !ad.url.startsWith('https://')) throw Error('광고를 준비하지 못했습니다.'); window.location.assign(ad.url); } catch (error) { setError(error.message); } finally { setBusy(false); } }}>{config.adsEnabled ? '광고 보기' : '준비 중'}</button></section>
    {error && <p className="error" role="alert">{error}</p>}<div className="notice-box"><Shield/><p>BP는 플랫폼 참여 자원입니다.<br/>현금이나 암호화폐가 아니며 전송·교환할 수 없습니다.</p></div>
  </main>;
}
function MapPage({ me, config, revision, refresh, onProfile, login }) {
  const el = useRef(null), map = useRef(null), layer = useRef(null);
  const [center, setCenter] = useState({ lat: 37.5665, lng: 126.978 }), [selected, setSelected] = useState(null), [form, setForm] = useState(null), [photo, setPhoto] = useState(null), [error, setError] = useAppMessage();
  const resource = useResource(() => api('/pins'), [revision, me?.id]);
  useEffect(() => {
    const instance = L.map(el.current, { zoomControl: false }).setView([37.5665, 126.978], 14); map.current = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(instance);
    instance.on('moveend', () => { const c = instance.getCenter(); setCenter({ lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) }); });
    instance.on('click', () => setSelected(null)); return () => { instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current || !resource.data) return;
    layer.current?.remove(); layer.current = L.layerGroup().addTo(map.current);
    for (const pin of resource.data) {
      // Use DOM textContent, never interpolate user-controlled titles into map HTML.
      const marker = document.createElement('span'); marker.style.setProperty('--pin', coinColor(pin.coin));
      const img = document.createElement('img'); img.src = `${import.meta.env.BASE_URL}coin-icons/${pin.coin.toLowerCase()}.svg`; img.alt = pin.coin;
      const fallback = document.createElement('b'); fallback.textContent = pin.coin;
      img.onerror = () => { img.style.display = 'none'; fallback.style.display = 'grid'; }; marker.append(img, fallback);
      const icon = L.divIcon({ className: 'battle-map-marker', html: marker, iconSize: [40, 48], iconAnchor: [20, 45] });
      L.marker([pin.lat, pin.lng], { icon }).addTo(layer.current).on('click', event => { L.DomEvent.stopPropagation(event.originalEvent); setSelected(pin); });
    }
  }, [resource.data]);
  const mine = resource.data?.filter(p => p.owner).length || 0;
  return <main className="map-page"><div className="map-stage"><div className="real-map" ref={el}/><div className="map-crosshair" aria-label="핀 생성 위치"/><div className="center-coordinate">{center.lat.toFixed(6)}, {center.lng.toFixed(6)}</div></div>
    {(resource.error || error) && <div className="map-message" role="alert">{resource.error || error}<button onClick={refresh}>다시 시도</button></div>}
    <div className="map-toolbar"><span>내 핀 {mine}/{me?.tier.limit || 1} · 보유 {me?.current_bp || 0} BP</span><button aria-label="지도 위에 핀 추가" disabled={!!me && (mine >= me.tier.limit || me.current_bp < config.pinCost)} onClick={() => me ? setForm({}) : login()}><MapPinPlus/></button></div>
    {selected && <PinDetailCard pin={selected} onProfile={onProfile} onImage={p => setPhoto(p.image)} onEdit={selected.owner ? p => setForm(p) : null} onDelete={selected.owner ? async p => { try { await api(`/pins/${p.id}`, 'DELETE'); setSelected(null); refresh(); } catch (error) { setError(error.message); } } : null}/>}
    {form && <PinForm initial={form.id ? form : undefined} center={center} pinCost={config.pinCost} onClose={() => setForm(null)} onSave={async value => { const pin = await api(form.id ? `/pins/${form.id}` : '/pins', form.id ? 'PATCH' : 'POST', value); setForm(null); setSelected(pin); refresh(); }}/>} 
    {photo && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="핀 사진" onClick={() => setPhoto(null)}><button aria-label="사진 닫기" onClick={() => setPhoto(null)}><X/></button><img src={photo} alt="핀 사진 전체"/></div>}
  </main>;
}
function Profile({ username, me, revision, refresh, actions, login, onLogout }) {
  const [view, setView] = useState('피드'), [editing, setEditing] = useState(false), [bio, setBio] = useState(''), [photo, setPhoto] = useState(''), [error, setError] = useAppMessage(), [busy, setBusy] = useState(false);
  const resource = useResource(() => username ? api(`/profiles/${encodeURIComponent(username)}`) : Promise.resolve(null), [username, revision, me?.id]);
  useEffect(() => { setView('피드'); setEditing(false); setError(''); }, [username]);
  if (!username) return <main><Empty text="로그인하고 나의 활동을 확인하세요"/><button className="primary" onClick={login}>로그인 / 회원가입</button></main>;
  const profile = resource.data;
  return <main><Status {...resource} retry={refresh}/>{profile && <>
    <section className="profile-head"><img className="profile-avatar" src={profile.profileImage || profileImage()} alt={`${username} 프로필`}/><h1>@{profile.username}</h1><p>{profile.bio || '아직 소개가 없습니다.'}</p><div className="profile-social"><button onClick={() => setView('팔로워')}><b>{profile.followers.length}</b> 팔로워</button><button onClick={() => setView('팔로잉')}><b>{profile.following.length}</b> 팔로잉</button></div></section>
    <section className="tier-card"><Trophy/><div><small>현재 등급</small><b>{profile.tier.name}</b><span>누적 {profile.lifetime.toLocaleString()} BP · 핀 {profile.tier.limit}개 사용 가능</span></div></section>
    <div className="profile-links">{profile.isMe ? <><button onClick={() => { setBio(profile.bio); setPhoto(profile.profileImage); setEditing(true); }}>프로필 수정</button><button onClick={onLogout}>로그아웃</button></> : <button disabled={busy} onClick={async () => { if (!me) { login(); return; } setBusy(true); try { await api(`/profiles/${encodeURIComponent(username)}/follow`, profile.isFollowing ? 'DELETE' : 'POST'); refresh(); } catch (error) { setError(error.message); } finally { setBusy(false); } }}>{profile.isFollowing ? '팔로잉 취소' : '팔로우'}</button>}</div>
    <div className="profile-tabs"><Segments compact items={['피드', '리포스트', 'PIN', '댓글', '활동']} value={view} onChange={setView}/></div>
    {['피드', '리포스트'].includes(view) && <div className="feed">{profile[view === '피드' ? 'posts' : 'reposts'].map(p => <PostCard key={p.repostId || p.id} post={presentationPost(p)} {...actions}/>)}{!profile[view === '피드' ? 'posts' : 'reposts'].length && <Empty text="아직 활동이 없습니다"/>}</div>}
    {view === 'PIN' && <div className="profile-pin-list">{profile.pins.map(pin => <div className="profile-pin-summary" key={pin.id}><Coin symbol={pin.coin}/><div><b>{pin.title}</b><p>{pin.description}</p><small>{pin.category} · {pin.lat}, {pin.lng}</small></div></div>)}{!profile.pins.length && <Empty text="등록한 핀이 없습니다"/>}</div>}
    {view === '댓글' && <div className="profile-comments">{profile.comments.map(c => <div key={c.id}><b>{c.postContent}</b><p>{c.content}</p><small>{age(c.created_at)}</small></div>)}{!profile.comments.length && <Empty text="작성한 댓글이 없습니다"/>}</div>}
    {view === '활동' && <section className="activity-list">{[['배틀 참여', profile.activity.battles], ['지지', profile.activity.support], ['반대', profile.activity.oppose], ['출석', profile.activity.checkins]].map(([label, value]) => <div key={label}>{label}<b>{value}회</b></div>)}</section>}
    {['팔로워', '팔로잉'].includes(view) && <div className="people-list">{profile[view === '팔로워' ? 'followers' : 'following'].map(name => <div key={name}><span>@{name}</span><button onClick={() => actions.onProfile(name)}>프로필 보기</button></div>)}</div>}
    {editing && <Modal title="프로필 수정" onClose={() => setEditing(false)}><Field label="소개"><textarea maxLength={200} value={bio} onChange={e => setBio(e.target.value)}/></Field><Field label="프로필 사진"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => { try { setPhoto(await readPhoto(e.target.files?.[0])); } catch (error) { setError(error.message); } }}/></Field>{photo && <img className="profile-avatar" src={photo} alt="프로필 미리보기"/>}<button className="primary" disabled={busy} onClick={async () => { setBusy(true); try { await api('/me', 'PATCH', { bio, profileImage: photo }); setEditing(false); refresh(); } catch (error) { setError(error.message); } finally { setBusy(false); } }}>저장</button>{error && <p className="error" role="alert">{error}</p>}</Modal>}
  </>}{error && !editing && <p className="error" role="alert">{error}</p>}</main>;
}

export default function App() {
  const [me, setMe] = useState(null), [config, setConfig] = useState(null), [page, setPage] = useState('home'), [revision, setRevision] = useState(0);
  const [auth, setAuth] = useState(false), [compose, setCompose] = useState(false), [battle, setBattle] = useState(null), [comments, setComments] = useState(null), [profile, setProfile] = useState(null), [error, setError] = useAppMessage(), [loading, setLoading] = useState(true);
  const [options, setOptions] = useState({ feed: '유저 피드', category: '노출', period: '오늘' });
  const refresh = useCallback(async () => {
    try { const user = await api('/me'); setMe(user); setRevision(x => x + 1); } catch (error) { setError(error.message); }
  }, []);
  const initialize = useCallback(async () => {
    setLoading(true); setError('');
    try { const [user, settings] = await Promise.all([api('/me'), api('/config')]); setMe(user); setConfig(settings); }
    catch (error) { setError(error.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { initialize(); }, [initialize]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible' && config) refresh(); };
    const timer = setInterval(onFocus, 60000);
    document.addEventListener('visibilitychange', onFocus); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onFocus); };
  }, [config, refresh]);
  const openProfile = username => { setProfile(username || me?.username); setPage('profile'); };
  const login = () => setAuth(true);
  const actions = {
    onProfile: openProfile,
    onBattle: post => { if (!me) login(); else setBattle(post); },
    onComment: setComments,
    onRepost: async post => { if (!me) { login(); return; } try { await api(`/posts/${post.id}/reposts`, 'POST'); refresh(); } catch (error) { setError(error.message); } },
    onDelete: async post => { try { await api(`/posts/${post.id}`, 'DELETE'); refresh(); } catch (error) { setError(error.message); } },
  };
  const logout = async () => { try { await api('/auth/logout', 'POST'); setMe(null); setProfile(null); setRevision(x => x + 1); } catch (error) { setError(error.message); } };
  return <div className={`app-shell ${page === 'map' ? 'map-active' : ''}`}><Header bp={me?.current_bp || 0} onProfile={() => openProfile(me?.username)}/>
    {error && <div className="app-error" role="alert">{error}<button aria-label="오류 닫기" onClick={() => setError('')}><X/></button></div>}
    {!config ? <main><Status loading={loading} error={!loading ? error || '서비스에 연결하지 못했습니다.' : ''} retry={initialize}/></main> : <>
      {page === 'home' && <Feed options={options} setOptions={setOptions} revision={revision} refresh={refresh} actions={actions} me={me} compose={() => me ? setCompose(true) : login()}/>}
      {page === 'map' && <MapPage me={me} config={config} revision={revision} refresh={refresh} onProfile={openProfile} login={login}/>}
      {page === 'check' && <Checkin me={me} config={config} refresh={refresh} login={login}/>}
      {page === 'profile' && <Profile username={profile} me={me} revision={revision} refresh={refresh} actions={actions} login={login} onLogout={logout}/>}
    </>}
    <nav className="bottom-nav">{[['home', '홈', Home], ['map', '지도', MapIcon], ['check', '체크인', CalendarCheck], ['profile', '프로필', CircleUserRound]].map(([id, label, Icon]) => <button key={id} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => id === 'profile' ? openProfile(me?.username) : setPage(id)}><Icon/><span>{label}</span></button>)}</nav>
    {compose && <Composer onClose={() => setCompose(false)} onPublish={async body => { await api('/posts', 'POST', body); setCompose(false); setPage('home'); refresh(); }}/>} 
    {comments && <Comments post={comments} onClose={() => setComments(null)} me={me} login={login} refresh={refresh}/>}
    {battle && me && config && <Battle post={battle} me={me} config={config} onClose={() => setBattle(null)} onUpdated={refresh}/>}
    {auth && <Auth onClose={() => setAuth(false)} onLogin={user => { setMe(user); setAuth(false); setProfile(user.username); setRevision(x => x + 1); }}/>} 
    {!auth && !compose && !battle && !comments && <InstallPrompt/>}
  </div>;
}
