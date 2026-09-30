import { coinMarker } from './coin-artwork.js';
import { useAppMessage, useFeedback } from './feedback.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Home, CalendarCheck, Map as MapIcon, MessageCircle, MapPinPlus, LocateFixed, Settings, X } from 'lucide-react';
import L from 'leaflet';
import { data, configured, googleEnabled } from './data.js';
import { Modal, Field, PinForm, PinDetailCard, InstallPrompt, Composer, profileImage } from './ui.jsx';
import { PagedHome } from './paged-feed.jsx';
import { PagedMap } from './paged-map.jsx';
import { debounce } from './query-timing.js';
import { HomePage, CheckinPage } from './social.jsx';
import { ProfileEditor } from './profile-editor.jsx';
import { CommunityProfile } from './community-profile.jsx';
import { FriendChat } from './friend-chat.jsx';
import { useLiveProfile } from './live-profile.js';
import { useBackDismiss, usePageBack } from './use-back-dismiss.js';
import { coinImage, coinColor } from './ui.jsx';

import { readViewState, saveViewState, readMapCamera, saveMapCamera } from './view-state.js';

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

export function MapPage({ pins, selected, select, me, login, edit, onProfile, onDelete, picking, onPick, onCancelPick, onBounds, moreControl, ownPinCount }) {
  const element = useRef(null), map = useRef(null), markers = useRef(null), markerById = useRef(new Map());
  const [cardTop, setCardTop] = useState(null);
  const [center, setCenter] = useState(readMapCamera), [locationError, setLocationError] = useAppMessage(), [photo, setPhoto] = useState(null);
  useEffect(() => {
    const instance = L.map(element.current, { zoomControl: false }).setView([center.lat, center.lng], center.zoom || 14); map.current = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(instance);
    instance.on('moveend', () => { const c = instance.getCenter(); saveMapCamera({lat:c.lat,lng:c.lng,zoom:instance.getZoom()}); setCenter({ lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) }); });
    instance.on('click', () => select(null));
    return () => { instance.remove(); map.current = null; };
  }, []);
  useEffect(()=>{
    if(!onBounds)return;
    const instance=map.current;
    const update=()=>{const b=instance.getBounds();const wrap=lng=>((lng+180)%360+360)%360-180;
      const world=b.getEast()-b.getWest()>=360;
      onBounds([Math.max(-90,b.getSouth()),world?-180:wrap(b.getWest()),Math.min(90,b.getNorth()),world?180:wrap(b.getEast())].map(v=>+v.toFixed(5)));
    };
    const delayed=debounce(update,300);update();instance.on('moveend resize',delayed);
    return()=>{delayed.cancel();instance.off('moveend resize',delayed);};
  },[onBounds]);
  useEffect(() => {
    markers.current?.remove(); markers.current = L.layerGroup().addTo(map.current);
    markerById.current.clear();
    for (const pin of pins) {
      const content = coinMarker(pin.coin);
      const marker = L.marker([pin.lat, pin.lng], { title: pin.title, icon: L.divIcon({ className: 'battle-map-marker', html: content, iconSize: [40, 48], iconAnchor: [20, 45] }) }).addTo(markers.current).on('click', () => select(pin));
      markerById.current.set(pin.id, marker);
    }
  }, [pins]);
  useEffect(() => { if (selected) map.current.setView([selected.lat, selected.lng], 15); }, [selected?.id]);
  useEffect(() => {
    if (!selected) { setCardTop(null); return; }
    const instance = map.current;
    const update = () => {
      const shell = markerById.current.get(selected.id)?.getElement()?.querySelector('.map-pin-shell');
      if (shell) setCardTop(shell.getBoundingClientRect().bottom - element.current.getBoundingClientRect().top + 10);
    };
    update(); instance.on('move zoom resize', update);
    const observer = new ResizeObserver(update); observer.observe(element.current);
    return () => { instance.off('move zoom resize', update); observer.disconnect(); };
  }, [selected?.id, pins]);
  useBackDismiss(!!selected && !picking,()=>select(null),20);
  const pickActions = picking && <div className="pin-pick-actions"><span>첨부할 Pin을 선택하세요</span><div><button type="button" onClick={onCancelPick}>취소</button><button type="button" className="pin-confirm-selection" disabled={!selected} onClick={() => selected && onPick(selected)}>선택</button></div></div>;
  return <main className="map-page"><div className="map-stage"><div className="real-map" ref={element}/><div className="map-crosshair" aria-label="거래 등록 위치"/><div className="center-coordinate">{center.lat.toFixed(6)}, {center.lng.toFixed(6)}</div></div>
    {picking && !selected && <div className="pin-detail pin-selection-empty"><p>지도에서 첨부할 Pin을 눌러 주세요.</p><div className="pin-detail-footer">{pickActions}</div></div>}
    {!picking && <div className="map-intro"><b>내 주변 P2P 거래</b><small>{configured ? `${pins.length}개의 거래 정보 · 지도를 움직여 위치를 선택하세요` : '거래 서비스를 준비 중입니다 · 지도를 둘러보세요'}</small></div>}
    {locationError && <div className="map-message" role="alert">{locationError}</div>}{moreControl}
    <div className="map-toolbar"><span>{me ? `내 거래 ${(ownPinCount ?? pins.filter(p => p.owner).length)}/3 · 무료 등록` : '로그인하고 거래를 등록하세요'}</span><button disabled={picking} aria-label="내 위치" onClick={() => { setLocationError(''); if (!navigator.geolocation) { setLocationError('위치 정보를 지원하지 않는 브라우저입니다.'); return; } navigator.geolocation.getCurrentPosition(p => map.current?.setView([p.coords.latitude, p.coords.longitude], 16), () => setLocationError('위치 권한을 확인하거나 지도를 직접 움직여 주세요.'), { timeout: 10000 }); }}><LocateFixed/></button><button aria-label="거래 등록" disabled={picking || (!!me && (ownPinCount ?? pins.filter(p => p.owner).length) >= 3)} onClick={() => me ? edit({ center }) : login()}><MapPinPlus/></button></div>
    {selected && <div className="map-pin-card-anchor" style={{ top: cardTop ?? 0, visibility: cardTop === null ? "hidden" : undefined }}><PinDetailCard pin={selected} interactionDisabled={picking} footer={pickActions} onDelete={selected.owner ? onDelete : undefined} onProfile={() => onProfile(selected.ownerId)} onEdit={selected.owner ? p => edit({ initial: p, center }) : undefined} onImage={p => setPhoto(p.image)}/></div>}
    {photo && <Modal title="거래 사진" onClose={() => setPhoto(null)}><img style={{ width: '100%' }} src={photo} alt="거래 첨부 사진"/></Modal>}
  </main>;
}

const FeedHome = data.page ? PagedHome : HomePage;
const MapScreen = props => data.page ? <PagedMap component={MapPage} ownPins={props.pins} {...props}/> : <MapPage {...props}/>;

export default function App() {
  const { notify } = useFeedback();
  const [restored] = useState(() => readViewState());
  const [me, setMe] = useState(null), [page, setPage] = useState(restored.page), [pins, setPins] = useState([]), [selected, select] = useState(null), [auth, setAuth] = useState(false), [form, setForm] = useState(null), [profileId, setProfileId] = useState(restored.profileId), [profile, setProfile] = useState(null), [editing, setEditing] = useState(false), [error, setError] = useAppMessage(), [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState(false), [following, setFollowing] = useState([]), [balance, setBalance] = useState({ current: 0, lifetime: 0, day: -1 });
  const [options, setOptions] = useState(restored.options);
  const [profileFeed, setProfileFeed] = useState('작성 피드');
  const myProfile=useLiveProfile(me?.id), viewedProfile=useLiveProfile(me && page === 'profile' ? profileId : null);
  const [pickingPin, setPickingPin] = useState(false), [attachedPin, setAttachedPin] = useState(null);
  useEffect(() => { saveViewState(undefined, { page: pickingPin ? 'home' : page, profileId, options }); }, [page, profileId, options, pickingPin]);
  const finishPick = pin => { if (pin) setAttachedPin(pin); setPickingPin(false); setPage('home'); };
  useBackDismiss(pickingPin, () => finishPick(null),50);
  usePageBack(page,profileId,setPage,setProfileId);
  const [settings,setSettings]=useState(false);

  const refresh = async () => { try { setPins(data.page ? me ? (await data.page({mode:'pins',owner:me.id,detail:true},null,true)).items : [] : await data.listPins()); } catch { setError('거래 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'); } };
  useEffect(() => data.watchAuth(setMe), []);
  useEffect(() => { setBalance({ current: 0, lifetime: 0, day: -1 }); return data.watchBalance(me?.id, setBalance, () => setError('BP를 불러오지 못했습니다.')); }, [me?.id]);
  useEffect(() => { setFollowing([]); if(data.page && page!=='profile')return; return data.watchFollowing(me?.id, setFollowing, () => setError('팔로잉 정보를 불러오지 못했습니다.')); }, [me?.id,page]);
  useEffect(() => { select(null); setPins([]); }, [me?.id]);
  useEffect(() => {
    if(page!=='map' && page!=='profile' && !compose)return;
    if(data.watchPinPage){
      const owner=page==='profile'?profileId:me?.id;
      if(!owner){setPins([]);return;}
      return data.watchPinPage(owner,setPins,()=>setError('거래 정보를 불러오지 못했습니다.'));
    }
    if(data.watchPins)return data.watchPins(setPins,()=>setError('거래 정보를 불러오지 못했습니다.'));
    void refresh();
  },[me?.id,profileId,page,compose]);
  useEffect(() => { setProfile(viewedProfile); }, [viewedProfile]);
  const openPin = async id => { try { const pin = await data.getPin(id); if (!pin) { setError('삭제되었거나 더 이상 존재하지 않는 Pin입니다.'); return; } select(pin); setPage('map'); } catch { setError('Pin을 불러오지 못했습니다.'); } };
  const openProfile = (id, feed = '작성 피드') => { setEditing(false); setProfileFeed(feed); setProfileId(id); setPage('profile'); };
  const perform = async action => { setBusy(true); setError(''); try { await action(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className={`app-shell community-app ${page === 'map' ? 'map-active' : ''}`}><header className="topbar">{me ? <button className="signed-in-brand" disabled={pickingPin} onClick={() => openProfile(me.id)} aria-label="내 프로필로 이동"><img src={myProfile?.profileImage || profileImage()} alt="내 프로필"/><span>{myProfile?.username || me.username}</span></button> : <div className="logo"><img className="brand-icon" src={profileImage()} alt="ㅋㅇㄱㄹ"/><div>ㅋㅇㄱㄹ<small>POWERED BY COIN HODLER</small></div></div>}{me ? page === 'profile' ? <button className="profile-settings-button" aria-label="설정" onClick={()=>setSettings(true)}><Settings/></button> : <span className="bp-pill">{balance.current} BP</span> : <button className="text-action" disabled={pickingPin} onClick={() => setAuth(true)}>로그인</button>}</header>
    {error && <div className="app-error" role="alert">{error}<button disabled={pickingPin} aria-label="닫기" onClick={() => setError('')}><X/></button></div>}
    {page === 'home' && <FeedHome onReposted={() => openProfile(me.id, '리포스트')} me={me} options={options} setOptions={setOptions} following={following} onProfile={openProfile} login={() => setAuth(true)} onPin={openPin} compose={() => { if (me) { setAttachedPin(null); setCompose(true); } else setAuth(true); }}/>}
    {page === 'chat' && <FriendChat me={me} login={() => setAuth(true)}/>}
    {page === 'check' && <CheckinPage me={me} balance={balance} login={() => setAuth(true)}/>}
    {page === 'map' && <MapScreen picking={pickingPin} onPick={finishPick} onCancelPick={() => finishPick(null)} pins={pins} selected={selected} select={select} me={me} login={() => setAuth(true)} edit={setForm} onProfile={openProfile} onDelete={pin => perform(async () => { await data.deletePin(pin.id); select(null); await refresh(); void notify("거래 정보를 삭제했습니다.", {kind:"success",title:"삭제 완료"}); })}/>}
    {page === 'profile' && <CommunityProfile initialFeed={profileFeed} onPin={openPin} profileId={profileId} profile={viewedProfile || profile} me={me} balance={balance} pins={pins} following={following} busy={busy} login={() => setAuth(true)} onProfile={openProfile} onEdit={() => setEditing(true)} onLogout={() => perform(async () => { await data.logout(); setProfileId(null); })} onFollow={id => me ? perform(() => data.follow(id, !following.includes(id))) : setAuth(true)} onMap={pin => { select(pin); setPage('map'); }} onPinEdit={pin => setForm({initial:pin,center:pin})} onPinDelete={pin => perform(async () => { await data.deletePin(pin.id); select(null); await refresh(); void notify("거래 정보를 삭제했습니다.", {kind:"success",title:"삭제 완료"}); })}/>}
    <nav className="bottom-nav">{[['home', '홈', Home], ['map', '지도', MapIcon], ['check', '체크인', CalendarCheck], ['chat', '채팅', MessageCircle]].map(([id, label, Icon]) => <button key={id} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined} disabled={pickingPin} onClick={() => setPage(id)}><Icon/><span>{label}</span></button>)}</nav>
    {compose && <Composer hidden={pickingPin} pins={pins.filter(pin => pin.owner)} selectedPin={attachedPin} onPinChange={setAttachedPin} onPickMap={() => { select(null); setPickingPin(true); setPage('map'); }} onClose={() => { setCompose(false); setAttachedPin(null); }} onPublish={async value => { await data.publish(value); setCompose(false); setPage('home'); void notify('새 피드를 게시했습니다.', {kind:'success',title:'게시 완료'}); }}/>}
    {form && <PinForm {...form} pinCost={0} onClose={() => setForm(null)} onSave={async value => { const pin = await data.savePin(value, form.initial?.id); setForm(null); await refresh(); select(pin); setPage('map'); }}/>}
    {editing && profile && profileId === me?.id && <ProfileEditor profile={viewedProfile || profile} onClose={() => setEditing(false)} onSaved={saved => { setProfile(saved); setEditing(false); void notify('프로필을 저장했습니다.', {kind:'success',title:'저장 완료'}); }}/>}

    {settings && <Modal title="설정" onClose={()=>setSettings(false)}><div className="profile-settings-menu"><button onClick={()=>{setSettings(false);openProfile(me.id);setEditing(true);}}>프로필 수정</button><button disabled={busy} onClick={()=>perform(async()=>{await data.logout();setSettings(false);setProfileId(null);})}>로그아웃</button></div></Modal>}
    {auth && <Auth close={() => setAuth(false)} done={u => { setMe(u); setAuth(false); if (page === 'profile') setProfileId(u.id); }}/>}
    {!auth && !form && !editing && !compose && <InstallPrompt/>}
  </div>;
}
