import React, { useEffect, useRef, useState } from "react";
import { BarChart3, Check, ChevronDown, ChevronUp, ImagePlus, MapPin, MessageCircle, Repeat2, Search, Shield, Swords, X, Zap } from "lucide-react";
import initialCoins from './cmc-top100.json';
import { watchInstallPrompt } from './install-prompt.js';
import { readPhoto } from './api.js';
export const cmcCoins = [...initialCoins, {id:'SL',symbol:'SL',name:'SASEUL'}];
export const asset = name => import.meta.env.BASE_URL + name;
const fmt = n => new Intl.NumberFormat('ko-KR',{notation: Math.abs(n)>999?'compact':'standard'}).format(n);
const exposure = p => p.support-p.oppose;
export const coinColor = symbol => ({BTC:'#f59e0b',ETH:'#627eea',SOL:'#14b8a6',XRP:'#334155',SL:'#7157ff'})[symbol]||'#7157ff';
export const profileImage = () => asset('koin-korae-violet-192.png');

export function Coin({ symbol, size = "md" }) {
  return (
    <span
      className={`coin coin-${size}`}
      style={{ "--coin": coinColor(symbol) }}
    >
      <span className="coin-fallback">{symbol.slice(0, 4)}</span>
      <img src={asset(`coin-icons/${symbol.toLowerCase()}.svg`)} alt={`${symbol} 아이콘`} onError={event=>{event.currentTarget.style.display="none"}} />
    </span>
  );
}

export function Header({ bp, onProfile }) {
  return (
    <header className="topbar">
      <div className="logo">
        <button className="header-profile" onClick={onProfile} aria-label="내 프로필로 이동"><img src={asset("koin-korae-violet-192.png")} alt="내 프로필" /></button>
        <div>ㅋㅇㄱㄹ<small>POWERED BY COIN HODLER</small></div>
      </div>
      <div className="bp-pill">
        <Zap /> <b>{bp}</b> BP
      </div>
    </header>
  );
}

export function Segments({ items, value, onChange, compact = false }) {
  return (
    <div className={`segments ${compact ? "compact" : ""}`}>
      {items.map((item) => (
        <button
          key={item}
          className={value === item ? "active" : ""}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}


export function PostCard({ post, onBattle, onComment, onRepost, onProfile, onDelete, rank }) {
  const [imageOpen, setImageOpen] = useState(false);
  const total = post.support + post.oppose || 1;
  return (
    <article className="post-card">
      <div className="post-head">
        <button className={`avatar tone-${post.tone}`} onClick={()=>onProfile?.(post.author)} aria-label={`${post.author} 프로필 보기`}>{post.initials}</button>
        <div>
          <b>@{post.author}</b>
          <span>{post.age}</span>
        </div>
        {rank && <span className="rank">#{rank}</span>}
        <Coin symbol={post.coin} />
      </div>
      <p className="post-body">{post.content}</p>
      {post.repostId && <small className="repost-label">@{post.repostAuthor}님의 리포스트 · 원본 @{post.author}</small>}
      {post.image&&<button className="post-image" type="button" onClick={()=>setImageOpen(true)} aria-label="피드 이미지 크게 보기"><img src={post.image} alt="피드 첨부 이미지"/></button>}
      <div className="battle-meter">
        <i style={{ width: `${(post.support / total) * 100}%` }} />
        <span>지지 {fmt(post.support)}</span>
        <span>반대 {fmt(post.oppose)}</span>
      </div>
      <div className="score-row">
        <div>
          <small>노출 점수</small>
          <strong className={exposure(post) < 0 ? "negative" : ""}>
            {exposure(post) > 0 ? "+" : ""}
            {fmt(exposure(post))}
          </strong>
        </div>
        <div className="card-actions">
          <button onClick={() => onComment(post)} aria-label="댓글 보기">
            <MessageCircle />
            {post.comments}
          </button>
          <button onClick={() => onRepost(post)} aria-label={post.reposted ? '리포스트 완료' : '리포스트'} disabled={post.reposted}>
            <Repeat2 />
            {post.reposts}
          </button>
          <button className="battle-btn" onClick={() => onBattle(post)}>
            <Swords />
            배틀
          </button>
        </div>
      </div>
      {post.owner && !post.repostId && onDelete && <button className="text-action danger-text" onClick={()=>onDelete(post)}>내 글 삭제</button>}
      {imageOpen && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="첨부 사진" onClick={()=>setImageOpen(false)}><button aria-label="사진 닫기" onClick={()=>setImageOpen(false)}><X/></button><img src={post.image} alt="피드 첨부 사진 전체"/></div>}
    </article>
  );
}


export function PinDetailCard({ pin, onProfile, onImage, onDelete, onEdit, className = "" }) {
  return (
    <div className={`pin-detail ${className}`}>
      {pin.image && (
        <button className="pin-detail-photo-button" onClick={() => onImage?.(pin)} aria-label="사진 전체 화면으로 보기">
          <img className="pin-detail-photo" src={pin.image} alt="핀 등록 사진" />
        </button>
      )}
      <div className="pin-detail-content">
        <div className="pin-creator">
          <Coin symbol={pin.coin} size="sm" />
          <button type="button" className="pin-creator-profile" onClick={() => onProfile?.(pin.creator || "battle_newbie")} aria-label="핀 생성자 프로필 보기">
            <img src={profileImage(pin.creator || "battle_newbie")} alt={`${pin.creator || "battle_newbie"} 프로필`} />
          </button>
          <span>@{pin.creator || "battle_newbie"}</span>
        </div>
        <small>{pin.category}{pin.tradeCoins?.length ? ` · 거래 가능한 코인: ${pin.tradeCoins.join(', ')}` : ''}</small>
        <b>{pin.title}</b>
        <p>{pin.description}</p>
        {pin.link && <a href={pin.link} target="_blank" rel="noreferrer">{pin.link}</a>}
        {onEdit && <button className="text-action" onClick={()=>onEdit(pin)}>핀 수정</button>}
      </div>
      {onDelete && <button className="pin-delete" aria-label="핀 삭제" title="핀 삭제" onClick={() => onDelete(pin)}>삭제</button>}
    </div>
  );
}

export function PinForm({ center, onClose, onSave, initial, pinCost = 1 }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    coin: "BTC",
    tradeCoins: [],
    link: "",
    lat: center.lat,
    lng: center.lng,
    image: "",
    category: '판매',
    ...initial,
  });
  const fileRef = useRef(null);
  const coins = cmcCoins;
  const toggle = (s) =>
    setForm((f) => ({
      ...f,
      tradeCoins: f.tradeCoins.includes(s)
        ? f.tradeCoins.filter((x) => x !== s)
        : [...f.tradeCoins, s],
    }));
  const valid =
    form.title.trim() &&
    form.description.trim() &&
    form.coin &&
    form.category &&
    Number.isFinite(+form.lat) &&
    Number.isFinite(+form.lng) && Math.abs(+form.lat)<=90 && Math.abs(+form.lng)<=180;
  const chooseImage = async (event) => {
    try { const image = await readPhoto(event.target.files?.[0]); setForm(current=>({...current,image})); setError(''); }
    catch(error) { setError(error.message); }
  };
  return (
    <Modal title={initial ? '핀 수정' : '지도위에 핀 추가'} onClose={onClose} className="pin-form-modal">
      <Field label="핀 종류"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{['판매','구매 희망','서비스','사업장'].map(value=><option key={value}>{value}</option>)}</select></Field>
      <div className="pin-location">
        <MapPin />
        <div>
          <b>지도 중앙의 + 위치</b>
          <span>
            위도 {form.lat} · 경도 {form.lng}
          </span>
        </div>
      </div>
      <div className="coordinate-fields">
        <Field label="위도">
          <input
            type="number"
            step="any"
            value={form.lat}
            onChange={(e) => setForm({ ...form, lat: e.target.value })}
          />
        </Field>
        <Field label="경도">
          <input
            type="number"
            step="any"
            value={form.lng}
            onChange={(e) => setForm({ ...form, lng: e.target.value })}
          />
        </Field>
      </div>
      <Field label="대표 코인 (핀 이미지)">
        <select
          value={form.coin}
          onChange={(e) => setForm({ ...form, coin: e.target.value })}
        >
          {coins.map((c) => (
            <option key={c.id}>{c.symbol}</option>
          ))}
        </select>
      </Field>
      <Field label="거래 가능한 코인 (복수 선택)">
        <div className="trade-coins">
          {coins.map((c) => (
            <button
              type="button"
              key={c.id}
              className={form.tradeCoins.includes(c.symbol) ? "selected" : ""}
              onClick={() => toggle(c.symbol)}
            >
              <Coin symbol={c.symbol} size="sm" />
              {c.symbol}
              {form.tradeCoins.includes(c.symbol) && <Check />}
            </button>
          ))}
        </div>
      </Field>
      <Field label="제목">
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="핀 제목을 입력하세요"
        />
      </Field>
      <Field label="설명">
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="상품, 서비스 또는 장소를 설명하세요"
        />
      </Field>
      <Field label="링크 (선택)">
        <input
          type="url"
          value={form.link}
          onChange={(e) => setForm({ ...form, link: e.target.value })}
          placeholder="https:// 홈페이지 또는 소셜 링크"
        />
      </Field>
      <Field label="사진 (선택 · 1장)">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={chooseImage} />
        {form.image ? (
          <div className="pin-photo-preview">
            <img src={form.image} alt="업로드 사진 미리보기" />
            <button type="button" onClick={() => setForm({ ...form, image: "" })}><X /></button>
          </div>
        ) : (
          <button type="button" className="pin-photo-picker" onClick={() => fileRef.current?.click()}><ImagePlus />사진 선택</button>
        )}
      </Field>
      <button
        className="primary"
        disabled={!valid || busy}
        onClick={async () => { setBusy(true); setError(''); try { await onSave({ ...form, lat: +form.lat, lng: +form.lng }); } catch(error) { setError(error.message); } finally { setBusy(false); } }}
      >
        {busy ? '저장 중…' : initial ? '수정 저장' : pinCost ? `이 위치에 핀 등록 · ${pinCost} BP` : '이 위치에 거래 무료 등록'}
      </button>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="secondary" onClick={onClose}>
        취소
      </button>
    </Modal>
  );
}

export function Composer({ onClose, onPublish }) {
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [content, setContent] = useState(""),
    [coin, setCoin] = useState("BTC"),
    [query, setQuery] = useState(""),
    [image,setImage]=useState("");
  const fileRef=useRef(null);
  const chooseImage=async event=>{try{setImage(await readPhoto(event.target.files?.[0]));setError('')}catch(error){setError(error.message)}};
  const list = cmcCoins
    .filter((c) =>
      `${c.name} ${c.symbol}`.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 12);
  return (
    <Modal title="새 피드 작성" onClose={onClose} className="composer-modal">
      <textarea
        className="composer-text"
        autoFocus
        value={content}
        maxLength={500}
        onChange={(e) => setContent(e.target.value)}
        placeholder="커뮤니티에 어떤 이야기를 전할까요?"
      />
      <span className="counter">{content.length}/500</span>
      <div className="feed-image-field">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={chooseImage}/>
        {image?<div className="feed-image-preview"><img src={image} alt="피드 이미지 미리보기"/><button type="button" onClick={()=>setImage("")} aria-label="이미지 제거"><X/></button></div>:<button type="button" className="feed-image-picker" onClick={()=>fileRef.current?.click()}><ImagePlus/>이미지 추가</button>}
      </div>
      <label className="search">
        <Search />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="지원 코인 검색"
        />
      </label>
      <div className="coin-list">
        {list.map((c) => (
          <button
            className={coin === c.symbol ? "selected" : ""}
            key={c.id}
            onClick={() => setCoin(c.symbol)}
          >
            <Coin symbol={c.symbol} />
            <span>
              <b>{c.name}</b>
              <small>
                {c.symbol} · #{c.cmcRank}
              </small>
            </span>
            {coin === c.symbol && <Check />}
          </button>
        ))}
      </div>
      <button
        className="primary"
        disabled={!content.trim() || busy}
        onClick={async()=>{setBusy(true);setError('');try{await onPublish({coin,content:content.trim(),image})}catch(error){setError(error.message)}finally{setBusy(false)}}}
      >
        {busy ? '게시 중…' : '게시하기'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  );
}

export function Modal({ title, onClose, children, className = "" }) {
  const element = useRef(null), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const root = element.current;
    const focusable = () => [...root.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type="hidden"]),textarea:not(:disabled),select:not(:disabled),a[href]')].filter(el => el.getClientRects().length);
    (focusable()[0] || root).focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.stopPropagation(); close.current(); }
      if (event.key === 'Tab') {
        const items = focusable();
        if (!items.length) { event.preventDefault(); return; }
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    root.addEventListener('keydown', onKey);
    return () => { root.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);
  return (
    <div className="overlay">
      <section ref={element} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`modal ${className}`}>
        <header>
          <b>{title}</b>
          <button onClick={onClose} aria-label="닫기">
            <X />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function PageTitle({ icon: Icon, title, sub }) {
  return (
    <div className="page-title">
      <span>
        <Icon />
      </span>
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
    </div>
  );
}

export function Empty({text}){return <div className="empty-state"><BarChart3/><h3>{text}</h3></div>}

export function InstallPrompt(){
  const [installEvent,setInstallEvent]=useState(null);
  const [installing,setInstalling]=useState(false);
  const controller=useRef(null);
  useEffect(()=>{
    controller.current=watchInstallPrompt(window,setInstallEvent);
    return()=>controller.current.dispose();
  },[]);
  const dismiss=()=>controller.current?.dismiss();
  const install=async()=>{
    if(!installEvent||installing)return;
    setInstalling(true);
    try { await installEvent.prompt(); await installEvent.userChoice; dismiss(); }
    catch { setInstallEvent(null); }
    finally { setInstalling(false); }
  };
  if(!installEvent)return null;
  return <div className="install-overlay" role="dialog" aria-modal="true" aria-labelledby="install-heading"><section className="install-card"><button className="install-dismiss" onClick={dismiss} aria-label="설치 안내 닫기"><X/></button><img src={asset("koin-korae-violet-192.png")} alt="ㅋㅇㄱㄹ 앱 아이콘"/><small>ㅋㅇㄱㄹ APP</small><h2 id="install-heading">앱으로 설치할까요?</h2><p>홈 화면에서 더 빠르고 편하게 이용할 수 있어요.</p><button className="install-action" onClick={install} disabled={installing}>{installing?"설치 확인 중…":"앱 설치하기"}</button><button className="install-later" onClick={dismiss}>나중에</button></section></div>
}
