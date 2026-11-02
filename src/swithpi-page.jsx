import {useFeedback} from './feedback.jsx';
import {swithpiErrorKey} from './swithpi-errors.js';
import React,{useEffect,useState} from 'react';
import {ArrowUpRight,BadgeCheck,CalendarClock,Gift,Wallet,ClipboardList} from 'lucide-react';
import {SwithPiIcon} from './swithpi-icon.jsx';
import {PiWalletModal,swithpi,walletDate} from './pi-wallet.jsx';
import {Modal} from './ui.jsx';
import {t} from './language.js';
import {SNAPSHOT_AT,EVENT_ID} from '../supabase/functions/_shared/swithpi.js';
const preview={id:EVENT_ID,title:'PSL 에어드롭',description:'Pi와 함께 시작하는 PSL. 메인넷 Pi 잔액과 락업된 Pi를 합산해 1 Pi당 1 PSL을 배정합니다.',category:'token',organizer:'PSL Mining',snapshot_at:SNAPSHOT_AT,closes_at:SNAPSHOT_AT,cap:'100000000'};
export function SwithPiPage({me,login}) {
 const {notify}=useFeedback();
 const [addressReview,setAddressReview]=useState(null),[confirmedAddress,setConfirmedAddress]=useState('');
 const [result,setResult]=useState(null),[status,setStatus]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[walletOpen,setWalletOpen]=useState(false),[filter,setFilter]=useState('all'),[mine,setMine]=useState(false),[apply,setApply]=useState(null),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now());
 const refresh=async()=>{const [r,s]=await Promise.all([swithpi('events'),me?swithpi('status'):null]);setResult(r);setStatus(s);return s;};
 useEffect(()=>{let live=true;setResult(null);setStatus(null);setConfirmedAddress('');setAddressReview(null);setApply(null);setError('');setLoading(true);Promise.all([swithpi('events'),me?swithpi('status'):null]).then(([r,s])=>{if(live){setResult(r);setStatus(s);}}).catch(e=>{if(live)setError(swithpiErrorKey(e));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[me?.id]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
 const entries=result?.entries||[],events=(result?.events||[preview]).filter(e=>(filter==='all'||e.category===filter)&&(!mine||entries.some(a=>a.event_id===e.id)));
 const addressKey=s=>s?.identity&&s.pslAddress?JSON.stringify([me?.id,s.identity.wallet_address,s.identity.verified_at,s.pslAddress]):'';
 const addressConfirmed=!!confirmedAddress&&confirmedAddress===addressKey(status);
 useEffect(()=>{setConfirmedAddress('');},[me?.id,status?.identity?.wallet_address,status?.identity?.verified_at,status?.pslAddress]);
 const reviewAddress=async()=>{if(!me){login();return;}setBusy(true);try{const s=await refresh();if(!s?.identity||!s.pslAddress){setWalletOpen(true);return;}setAddressReview(s);}catch(e){await notify(swithpiErrorKey(e),{kind:'error'});}finally{setBusy(false);}};
 const openWallet=()=>me?setWalletOpen(true):login();
 return <main className="swithpi-page">
  <header className="swithpi-heading"><span className="swithpi-emblem"><SwithPiIcon/></span><div><h1>SwithPi</h1><p>Start with Pi</p></div><button className={'swithpi-mine '+(mine?'active':'')} onClick={()=>{if(!me){login();return;}setMine(!mine);}} aria-pressed={mine}><ClipboardList aria-hidden="true"/><span>{t('내 신청 내역')}</span></button></header>
  <p className="swithpi-intro">{t('Pi와 함께 만나는 새로운 시작과 선물')}</p>
  <button className="swithpi-wallet-bar" onClick={openWallet}>{status?.identity?<BadgeCheck className="pi-verified"/>:<Wallet/>}<span>{status?.identity?t('Pi 지갑 인증 완료'):t('Pi 지갑 인증하고 에어드롭에 참여하세요')}<small>{status?.identity?t('에드 지갑주소, 상품 및 서비스를 받을 주소 등록'):t('Pi 지갑 인증 및 에드 지갑주소, 상품 및 서비스를 받을 주소 등록')}</small></span><ArrowUpRight/></button>
  <div className="segments swithpi-filters" aria-label={t('에어드롭 종류')}>{[['all','모든 종류'],['token','토큰'],['product','상품'],['service','서비스']].map(([id,label])=><button key={id} className={filter===id?'active':''} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{t(label)}</button>)}</div>
  {error&&<div className="swithpi-error" role="alert"><p>{t('이벤트 정보를 불러오지 못했습니다. 신청은 서버 연결 후 가능합니다.')}</p><small>{t(error)}</small><button className="secondary" disabled={loading} onClick={async()=>{setLoading(true);try{await refresh();setError('');}catch(e){setError(swithpiErrorKey(e));}finally{setLoading(false);}}}>{t('다시 시도')}</button></div>}
  {loading&&<p role="status">{t('불러오는 중…')}</p>}
  <div className="swithpi-feed">{events.map(event=>{
   const entry=entries.find(a=>a.event_id===event.id),closed=now>=Date.parse(event.closes_at),upcoming=now<Date.parse(event.opens_at),active=!!result&&event.enabled&&!closed&&!upcoming;
   return <article className="swithpi-card" key={event.id}>
    <div className="swithpi-card-top"><img className="swithpi-project swithpi-token-icon" src={import.meta.env.BASE_URL+'coin-icons/psl.svg'} alt="PSL"/><div><b>{event.organizer}</b><small>{t('토큰 에어드롭')}</small></div><span className={'swithpi-status '+(active?'live':'')}>{!result?t('안내'):event.completed_at?t('지급 완료'):closed?t('모집 마감'):upcoming?t('예정'):active?t('진행 중'):t('준비 중')}</span></div>
    <div className="swithpi-banner"><span>PSL</span><SwithPiIcon/><small>Start with Pi</small></div>
    <h2>{t(event.title)}</h2><p>{t(event.description)}</p>
    <div className="swithpi-reward"><strong>1 Pi <span>=</span> 1 PSL</strong><span>{t('총 1억 PSL · 선착순 배정')}</span></div>
    <dl className="swithpi-facts"><div><dt><CalendarClock size={15}/>{t('스냅샷 / 신청 마감')}</dt><dd>{walletDate(event.snapshot_at)}</dd></div><div><dt>{t('잔액 기준')}</dt><dd>{t('메인넷 Pi + 락업된 Pi')}</dd></div><div><dt>{t('지급 예정일')}</dt><dd>{event.payout_at?walletDate(event.payout_at):t('추후 공지')}</dd></div>{event.completed_at&&<div><dt>{t('지급 완료일')}</dt><dd>{walletDate(event.completed_at)}</dd></div>}</dl>
    <details className="swithpi-rules"><summary>{t('참여 조건과 지급 기준')}</summary><ul><li>{t('Pi 지갑 소유권 인증과 PSL 수령 지갑 등록이 필요합니다.')}</li><li>{t('신청 완료 서버 기록 순서로 배정하며, 총 1억 PSL 소진 시 마지막 신청자는 잔여 물량만 받습니다.')}</li><li>{t('신청 시 Pi 지갑과 PSL 수령 지갑이 고정됩니다. 같은 Pi 지갑은 한 번만 신청할 수 있습니다.')}</li><li>{t('신청은 지급 확정이 아닙니다. 스냅샷 잔액과 선착순 배정 결과에 따라 지급량이 결정됩니다.')}</li></ul></details>
    {entry&&<div className="swithpi-entry" role="status"><b><BadgeCheck size={17}/>{t('신청 완료')}</b><span>{walletDate(entry.applied_at)}</span><span>{entry.paid_at?t('지급 완료'):entry.allocation!=null?`${entry.allocation} PSL · ${t('배정 결과')}`:t('스냅샷 대기')}</span><details><summary>{t('신청 지갑 확인')}</summary><p>Pi: {entry.pi_address}</p><p>PSL: {entry.psl_address}</p></details></div>}
    <div className="swithpi-steps">
     {!entry&&<>
     <button className="primary" disabled={busy} onClick={openWallet}>{status?.identity&&<span className="step-complete"><BadgeCheck aria-label={t('인증 완료')}/></span>}<span>{t('1단계: Pi 지갑 소유권 인증')}</span></button>
     <button className="primary" disabled={busy} onClick={reviewAddress}>{addressConfirmed&&<span className="step-complete"><BadgeCheck aria-label={t('확인 완료')}/></span>}<span>{t('2단계: PSL 지갑 주소 확인')}</span></button>
     </>}
     <button className="primary" disabled={!active||!!entry||busy||!status?.identity||!addressConfirmed} onClick={()=>{setAccepted(false);setApply(event);}}><span>{entry?t('신청 완료'):closed?t('마감'):t('신청하기')}</span></button>
    </div>
   </article>;
  })}</div>
  {!events.length&&<div className="swithpi-empty"><Gift/><p>{mine?t('아직 신청한 이벤트가 없습니다.'):t('새로운 선물을 준비하고 있어요.')}</p></div>}
  {walletOpen&&<PiWalletModal key={me?.id} onClose={()=>setWalletOpen(false)} onChange={setStatus}/>}
  {addressReview&&<Modal title={t('PSL 지갑 주소 확인')} onClose={()=>setAddressReview(null)}><p>{t('PSL을 받을 지갑 주소가 맞는지 확인해 주세요.')}</p><output className="wallet-address">{addressReview.pslAddress}</output><div className="swithpi-address-actions"><button className="secondary" onClick={()=>{setConfirmedAddress('');setAddressReview(null);setWalletOpen(true);}}>{t('지갑주소 변경')}</button><button className="primary" onClick={()=>{setConfirmedAddress(addressKey(addressReview));setAddressReview(null);}}>{t('이 주소로 확인')}</button></div></Modal>}
  {apply&&status?.identity&&<Modal title={t('PSL 에어드롭 신청')} onClose={()=>{if(!busy)setApply(null);}}><p>{t('아래 지갑으로 신청합니다. 신청 후 지갑을 변경할 수 없습니다.')}</p><dl className="wallet-details"><dt>{t('Pi 지갑 주소')}</dt><dd>{status.identity.wallet_address}</dd><dt>{t('PSL 수령 지갑 주소')}</dt><dd>{status.pslAddress}</dd></dl><label className="swithpi-consent"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>{t('스냅샷 시각, 락업 포함 잔액, 선착순·잔여 물량 지급 조건을 확인했습니다.')}</span></label>{error&&<p className="error" role="alert">{t(error)}</p>}<button className="primary" disabled={!accepted||busy||!addressConfirmed} onClick={async()=>{setBusy(true);setError('');try{const latest=await refresh();if(addressKey(latest)!==confirmedAddress){setConfirmedAddress('');setApply(null);await notify('지갑 정보가 변경되었습니다. PSL 지갑 주소를 다시 확인해 주세요.');return;}await swithpi('apply',{eventId:apply.id,termsVersion:'2026-11-02'});await refresh();setApply(null);}catch(e){setError(swithpiErrorKey(e));}finally{setBusy(false);}}}>{busy?t('신청 중…'):t('신청 완료하기')}</button></Modal>}
 </main>;
}
