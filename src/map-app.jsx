import { useAppMessage, useFeedback } from './feedback.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Home, CalendarCheck, Map as MapIcon, CircleUserRound, MapPinPlus, LocateFixed, X } from 'lucide-react';
import L from 'leaflet';
import { data, configured, googleEnabled } from './data.js';
import { Modal, Field, PinForm, PinDetailCard, InstallPrompt, Composer, profileImage } from './ui.jsx';
import { HomePage, CheckinPage } from './social.jsx';
import { readPhoto } from './api.js';

function Auth(props) { return googleEnabled ? <GoogleAuth {...props}/> : <EmailAuth {...props}/>; }

function EmailAuth({ close, done }) {
  const { notify } = useFeedback();
  const [register, setRegister] = useState(false), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useAppMessage();
  const run = async action => { setBusy(true); setMessage(''); try { await action(); } catch (e) { setMessage(e.code?.startsWith('auth/') ? '이메일과 비밀번호 또는 로그인 설정을 확인해 주세요.' : e.message); } finally { setBusy(false); } };
  return <Modal title={register ? '회원가입' : '로그인'} onClose={close}><form onSubmit={e => { e.preventDefault(); run(async () => { const u = register ? await data.register(email, password, name) : await data.login(email, password); done(u); }); }}>
    <p className="form-help">로그인하고 내 주변의 P2P 거래 정보를 등록하세요.</p>
    {!configured && <p role="status">로그인과 거래 등록을 준비 중입니다.</p>}
    {register && <Field label="닉네임"><input required maxLength={24} value={name} onChange={e => setName(e.target.value)}/></Field>}
    <Field label="이메일"><input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/></Field>
    <Field label="비밀번호"><input required type="password" minLength={register ? 10 : 1} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)}/></Field>
    {message && <p role="alert">{message}</p>}<button className="primary" disabled={busy || !configured}>{busy ? '확인 중…' : register ? '회원가입' : '로그인'}</button>
    <button type="button" className="secondary" onClick={() => setRegister(!register)}>{register ? '로그인으로 돌아가기' : '회원가입'}</button>
    {!register && <button type="button" className="secondary" disabled={!email || busy || !configured} onClick={() => run(async () => { await data.resetPassword(email); void notify('비밀번호 재설정 메일을 확인해 주세요.', { title: '메일 발송 안내', kind: 'success' }); })}>비밀번호 재설정</button>}
  </form></Modal>;
}

function GoogleAuth({ close, done }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useAppMessage();
  return <Modal title="로그인" onClose={close}><p className="form-help">Google 계정으로 로그인하고 피드·출석·거래 정보를 이용하세요.</p>
    <button className="google-login" disabled={busy || !configured} onClick={async () => {
      setBusy(true); setMessage('');
      try { done(await data.loginGoogle()); }
      catch (e) { setMessage(({ 'auth/popup-blocked': '팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 눌러 주세요.', 'auth/popup-closed-by-user': '로그인 창이 닫혔습니다. 다시 시도할 수 있습니다.', 'auth/cancelled-popup-request': '로그인이 취소되었습니다.', 'auth/unauthorized-domain': '이 주소의 로그인이 아직 설정되지 않았습니다. 공식 앱 주소로 접속해 주세요.', 'auth/network-request-failed': '인터넷 연결을 확인하고 다시 시도해 주세요.' })[e.code] || 'Google 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.'); }
      finally { setBusy(false); }
    }}><svg aria-hidden="true" viewBox="0 0 48 48"><path fill="#4285F4" d="M44 24.5c0-1.5-.1-2.6-.4-3.8H24v7.4h11.5c-.2 1.8-1.5 4.5-4.2 6.3l6.4 5C41.6 35.8 44 30.7 44 24.5Z"/><path fill="#34A853" d="M24 45c5.6 0 10.3-1.8 13.7-5l-6.4-5c-1.7 1.2-4 2-7.3 2-5.4 0-10-3.6-11.6-8.6l-6.6 5.1A20.7 20.7 0 0 0 24 45Z"/><path fill="#FBBC05" d="M12.4 28.4a12.6 12.6 0 0 1 0-8.8l-6.6-5.1a21 21 0 0 0 0 19l6.6-5.1Z"/><path fill="#EA4335" d="M24 11c3.7 0 6.2 1.6 7.6 2.9l5.7-5.6A19.9 19.9 0 0 0 24 3 20.7 20.7 0 0 0 5.8 14.5l6.6 5.1C14 14.6 18.6 11 24 11Z"/></svg>{busy ? 'Google 로그인 중…' : 'Google로 계속하기'}</button>
    <p className="form-help">카카오톡 등 앱 안의 브라우저에서 열었다면 Chrome 또는 Safari에서 접속해 주세요.</p>{message && <p role="alert" className="error">{message}</p>}
  </Modal>;
}

function MapPage({ pins, selected, select, me, login, edit, onProfile }) {
  const element = useRef(null), map = useRef(null), markers = useRef(null);
  const [center, setCenter] = useState({ lat: 37.5665, lng: 126.978 }), [locationError, setLocationError] = useAppMessage(), [photo, setPhoto] = useState(null);
  useEffect(() => {
    const instance = L.map(element.current, { zoomControl: false }).setView([center.lat, center.lng], 14); map.current = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(instance);
    instance.on('moveend', () => { const c = instance.getCenter(); setCenter({ lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) }); });
    instance.on('click', () => select(null));
    return () => { instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    markers.current?.remove(); markers.current = L.layerGroup().addTo(map.current);
    for (const pin of pins) {
      const content = document.createElement('span'); content.style.setProperty('--pin', '#7157ff');
      const label = document.createElement('b'); label.style.display = 'grid'; label.textContent = pin.coin; content.append(label);
      L.marker([pin.lat, pin.lng], { title: pin.title, icon: L.divIcon({ className: 'battle-map-marker', html: content, iconSize: [40, 48], iconAnchor: [20, 45] }) }).addTo(markers.current).on('click', () => select(pin));
    }
  }, [pins]);
  useEffect(() => { if (selected) map.current.setView([selected.lat, selected.lng], 15); }, [selected?.id]);
  return <main className="map-page"><div className="map-stage"><div className="real-map" ref={element}/><div className="map-crosshair" aria-label="거래 등록 위치"/><div className="center-coordinate">{center.lat.toFixed(6)}, {center.lng.toFixed(6)}</div></div>
    <div className="map-intro"><b>내 주변 P2P 거래</b><small>{configured ? `${pins.length}개의 거래 정보 · 지도를 움직여 위치를 선택하세요` : '거래 서비스를 준비 중입니다 · 지도를 둘러보세요'}</small></div>
    {locationError && <div className="map-message" role="alert">{locationError}</div>}
    <div className="map-toolbar"><span>{me ? `내 거래 ${pins.filter(p => p.owner).length}/3 · 무료 등록` : '로그인하고 거래를 등록하세요'}</span><button aria-label="내 위치" onClick={() => { setLocationError(''); if (!navigator.geolocation) { setLocationError('위치 정보를 지원하지 않는 브라우저입니다.'); return; } navigator.geolocation.getCurrentPosition(p => map.current?.setView([p.coords.latitude, p.coords.longitude], 16), () => setLocationError('위치 권한을 확인하거나 지도를 직접 움직여 주세요.'), { timeout: 10000 }); }}><LocateFixed/></button><button aria-label="거래 등록" disabled={!!me && pins.filter(p => p.owner).length >= 3} onClick={() => me ? edit({ center }) : login()}><MapPinPlus/></button></div>
    {selected && <PinDetailCard pin={selected} onProfile={() => onProfile(selected.ownerId)} onEdit={selected.owner ? p => edit({ initial: p, center }) : undefined} onImage={p => setPhoto(p.image)}/>}
    {photo && <Modal title="거래 사진" onClose={() => setPhoto(null)}><img style={{ width: '100%' }} src={photo} alt="거래 첨부 사진"/></Modal>}
  </main>;
}

export default function App() {
  const { confirm, notify } = useFeedback();
  const [me, setMe] = useState(null), [page, setPage] = useState('home'), [pins, setPins] = useState([]), [selected, select] = useState(null), [auth, setAuth] = useState(false), [form, setForm] = useState(null), [profileId, setProfileId] = useState(null), [profile, setProfile] = useState(null), [editing, setEditing] = useState(false), [error, setError] = useAppMessage(), [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState(false), [following, setFollowing] = useState([]), [balance, setBalance] = useState({ current: 0, lifetime: 0, day: -1 });
  const [options, setOptions] = useState({ feed: '유저 피드', category: '노출', period: '오늘' });
  const refresh = async () => { try { setPins(await data.listPins()); } catch { setError('거래 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'); } };
  useEffect(() => data.watchAuth(setMe), []);
  useEffect(() => { setBalance({ current: 0, lifetime: 0, day: -1 }); return data.watchBalance(me?.id, setBalance, () => setError('BP를 불러오지 못했습니다.')); }, [me?.id]);
  useEffect(() => { setFollowing([]); return data.watchFollowing(me?.id, setFollowing, () => setError('팔로잉 정보를 불러오지 못했습니다.')); }, [me?.id]);
  useEffect(() => { select(null); refresh(); const timer = setInterval(refresh, 60000); return () => clearInterval(timer); }, [me?.id]);
  useEffect(() => { let active = true; setProfile(null); setEditing(false); if (profileId) data.profile(profileId).then(p => { if (active) setProfile(p); }).catch(() => { if (active) setError('프로필을 불러오지 못했습니다.'); }); return () => { active = false; }; }, [profileId, me?.username]);
  const openProfile = id => { setProfileId(id); setPage('profile'); };
  const perform = async action => { setBusy(true); setError(''); try { await action(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className={`app-shell community-app ${page === 'map' ? 'map-active' : ''}`}><header className="topbar"><div className="logo"><img className="brand-icon" src={profileImage()} alt="ㅋㅇㄱㄹ"/><div>ㅋㅇㄱㄹ<small>POWERED BY COIN HODLER</small></div></div><button className="text-action" onClick={() => me ? openProfile(me.id) : setAuth(true)}>{me ? `${balance.current} BP · 내 프로필` : '로그인'}</button></header>
    {error && <div className="app-error" role="alert">{error}<button aria-label="닫기" onClick={() => setError('')}><X/></button></div>}
    {page === 'home' && <HomePage me={me} options={options} setOptions={setOptions} following={following} onProfile={openProfile} compose={() => me ? setCompose(true) : setAuth(true)}/>}
    {page === 'check' && <CheckinPage me={me} balance={balance} login={() => setAuth(true)}/>}
    {page === 'map' && <MapPage pins={pins} selected={selected} select={select} me={me} login={() => setAuth(true)} edit={setForm} onProfile={openProfile}/>}
    {page === 'profile' && <main>
      {!profileId ? <section className="profile-head"><img className="profile-avatar" src={profileImage()} alt="앱 아이콘"/><h1>나의 거래 프로필</h1><p>로그인하고 거래 정보를 관리하세요.</p><button className="primary" onClick={() => setAuth(true)}>로그인 / 회원가입</button></section> : profile && <>
        <section className="profile-head"><img className="profile-avatar" src={profile.profileImage || profileImage()} alt="프로필"/><h1>{profile.username}</h1><p>{profile.bio || '내 주변에서 코인 거래를 시작해 보세요.'}</p></section>
        {profileId === me?.id && <div className="profile-links"><button onClick={() => setEditing(true)}>프로필 수정</button><button disabled={busy} onClick={() => perform(async () => { await data.logout(); setProfileId(null); })}>로그아웃</button></div>}
        {profileId !== me?.id && <div className="profile-links"><button disabled={busy} onClick={() => me ? perform(() => data.follow(profileId, !following.includes(profileId))) : setAuth(true)}>{following.includes(profileId) ? '팔로잉 취소' : '팔로우'}</button></div>}
        <h2 className="map-profile-title">등록한 거래 {pins.filter(p => p.ownerId === profileId).length}개</h2>
        <div className="profile-pin-list">{pins.filter(p => p.ownerId === profileId).map(p => <article className="profile-pin-summary" key={p.id}><div><b>{p.title}</b><p>{p.category} · {p.coin}</p><button onClick={() => { select(p); setPage('map'); }}>지도에서 보기</button>{p.owner && <><button onClick={() => setForm({ initial: p, center: p })}>수정</button><button disabled={busy} onClick={() => perform(async () => { if (!(await confirm('거래 정보를 삭제할까요?', { title: '거래 삭제', confirmLabel: '삭제' }))) return; await data.deletePin(p.id); await refresh(); void notify('거래 정보를 삭제했습니다.', { kind: 'success', title: '삭제 완료' }); })}>삭제</button></>}</div></article>)}</div>
      </>}
    </main>}
    <nav className="bottom-nav">{[['home', '홈', Home], ['map', '지도', MapIcon], ['check', '체크인', CalendarCheck], ['profile', '프로필', CircleUserRound]].map(([id, label, Icon]) => <button key={id} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} onClick={() => id === 'profile' ? openProfile(me?.id) : setPage(id)}><Icon/><span>{label}</span></button>)}</nav>
    {compose && <Composer onClose={() => setCompose(false)} onPublish={async value => { await data.publish(value); setCompose(false); setPage('home'); void notify('새 피드를 게시했습니다.', {kind:'success',title:'게시 완료'}); }}/>}
    {form && <PinForm {...form} pinCost={0} onClose={() => setForm(null)} onSave={async value => { const pin = await data.savePin(value, form.initial?.id); setForm(null); await refresh(); select(pin); setPage('map'); }}/>}
    {editing && profile && <Modal title="프로필 수정" onClose={() => setEditing(false)}><Field label="소개"><textarea maxLength={200} value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })}/></Field><Field label="프로필 사진"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => perform(async () => setProfile({ ...profile, profileImage: await readPhoto(e.target.files?.[0]) }))}/></Field>{error && <p role="alert">{error}</p>}<button className="primary" disabled={busy} onClick={() => perform(async () => { await data.saveProfile(profile); setEditing(false); void notify('프로필을 저장했습니다.', { kind: 'success', title: '저장 완료' }); })}>저장</button></Modal>}
    {auth && <Auth close={() => setAuth(false)} done={u => { setMe(u); setAuth(false); if (page === 'profile') setProfileId(u.id); }}/>}
    {!auth && !form && !editing && !compose && <InstallPrompt/>}
  </div>;
}
