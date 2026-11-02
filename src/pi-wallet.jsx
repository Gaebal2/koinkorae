import {useFeedback} from './feedback.jsx';
import {swithpiErrorKey} from './swithpi-errors.js';
import React,{useEffect,useState,useRef} from 'react';
import {BadgeCheck,Copy,ExternalLink,Wallet} from 'lucide-react';
import {data} from './data.js';
import {Modal} from './ui.jsx';
import {t,getLocale} from './language.js';
import './swithpi.css';
export const swithpi=(action,value)=>data.swithpi?data.swithpi(action,value):Promise.reject(Error('지갑 인증 서비스가 준비되지 않았습니다.'));
export const walletDate=value=>new Intl.DateTimeFormat(getLocale(),{dateStyle:'medium',timeStyle:'short',hourCycle:'h23',timeZone:'Asia/Seoul'}).format(new Date(value))+' KST';
export function PiWalletButton({userId}) {
 const [open,setOpen]=useState(false),[verified,setVerified]=useState(false);
 useEffect(()=>{let live=true;setVerified(false);swithpi('status').then(s=>{if(live)setVerified(!!s.identity);}).catch(()=>{});return()=>{live=false;};},[userId]);
 return <><button className="pi-wallet-button" data-verified={verified} onClick={()=>setOpen(true)}>{verified?<BadgeCheck className="pi-verified" aria-label={t('인증 완료')}/>:<Wallet aria-hidden="true"/>}<span>{t('Pi 지갑 소유권 인증')}</span></button>{open&&<PiWalletModal key={userId} onClose={()=>setOpen(false)} onChange={s=>setVerified(!!s.identity)}/>}</>;
}
export function PiWalletModal({onClose,onChange=()=>{}}) {
 const {notify,confirm}=useFeedback(),importLock=useRef(false);
 const [status,setStatus]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [wallet,setWallet]=useState(''),[challenge,setChallenge]=useState(null),[now,setNow]=useState(Date.now()),[psl,setPsl]=useState(''),[editing,setEditing]=useState(false);
 const refresh=async()=>{const s=await swithpi('status');setStatus(s);setPsl(s.pslAddress||'');setEditing(!s.pslAddress);onChange(s);return s;};
 useEffect(()=>{let active=true;swithpi('status').then(s=>{if(active){setStatus(s);setPsl(s.pslAddress||'');setEditing(!s.pslAddress);}}).catch(e=>{if(active)setError(swithpiErrorKey(e));});return()=>{active=false;};},[]);
 useEffect(()=>{if(!challenge)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[challenge]);
 const run=async fn=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(swithpiErrorKey(e));}finally{setBusy(false);}};
 const remaining=challenge?Math.max(0,Math.ceil((Date.parse(challenge.expires_at)-now)/1000)):0;
 const identity=status?.identity;
 return <Modal title={t('Pi 지갑 소유권 인증')} onClose={onClose} className="pi-wallet-modal">
  {error&&<p className="error" role="alert">{t(error)}</p>}{notice&&<p className="wallet-notice" role="status">{t(notice)}</p>}
  {!status?<><p role="status">{t('인증 정보를 불러오는 중…')}</p>{error&&<button className="secondary" disabled={busy} onClick={()=>run(refresh)}>{t('다시 시도')}</button>}</>:<>
  <section className="wallet-card">
   <p className="wallet-network-note">{t('테스트넷과 메인넷의 Pi 지갑 주소는 동일합니다.')}</p>
   <h3>{identity?<><BadgeCheck className="pi-verified"/>{t('Pi 지갑 인증 완료')}</>:<><Wallet/>{t('Pi 테스트넷 지갑 인증')}</>}</h3>
   {identity?<dl className="wallet-details"><dt>{t('Pi 지갑 주소')}</dt><dd>{identity.wallet_address}</dd><dt>{t('인증 완료 날짜')}</dt><dd>{walletDate(identity.verified_at)}</dd><dt>{t(identity.source==='psl_mining'?'연결한 Google 계정':'인증 당시 구글 계정')}</dt><dd>{identity.verified_email}</dd><dt>{t('네트워크')}</dt><dd>{t(identity.network==='mainnet'?'Pi 메인넷':'Pi 테스트넷')}</dd>{identity.source==='psl_mining'&&<><dt>{t('인증 출처')}</dt><dd>PSL Mining</dd><dt>{t('가져온 날짜')}</dt><dd>{walletDate(identity.imported_at)}</dd></>}</dl>:<>
    <p>{t('본인 Pi 테스트넷 지갑의 G로 시작하는 주소를 입력하세요. 일회성 Muxed 주소로 3.14 Test-Pi를 보내 소유권을 확인합니다.')}</p>
    <p className="wallet-fee">{t('생성된 Muxed 주소는 본인 지갑의 별칭입니다. 3.14 Test-Pi는 본인 지갑으로 돌아오며, 테스트넷 네트워크 수수료는 본인이 부담합니다. 실제 메인넷 Pi는 사용하지 않습니다. 비밀문구나 개인키는 입력하지 마세요.')}</p>
    {challenge?<>
     <label className="field"><span>{t('입력한 Pi 지갑 주소')}</span><output className="wallet-address">{challenge.wallet_address}</output></label>
     <label className="field"><span>{t('받는 주소 · 일회성 Muxed 주소')}</span><textarea readOnly rows={3} value={challenge.muxed_address}/></label>
     <button className="secondary" onClick={()=>run(async()=>{await navigator.clipboard.writeText(challenge.muxed_address);setNotice('주소를 복사했습니다.');})} disabled={busy}><Copy size={16}/>{t('주소 복사')}</button>
     <p><b>{t('보낼 금액')}: 3.14 Test-Pi</b></p><p role="timer">{t('남은 유효시간')}: {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</p>
     <button className="primary" disabled={busy||remaining===0} onClick={()=>run(async()=>{const r=await swithpi('verify',{id:challenge.id});if(r.verified){setChallenge(null);await refresh();setNotice('Pi 지갑 소유권 인증이 완료되었습니다.');}else setNotice('아직 일치하는 거래가 없습니다. 전송 완료 후 다시 확인해 주세요.');})}>{busy?t('확인 중…'):t('입금 확인')}</button>
     <button className="secondary" disabled={busy} onClick={()=>setChallenge(null)}>{t('지갑 주소 변경 / 재요청')}</button>
    </>:<form onSubmit={e=>{e.preventDefault();void run(async()=>{let c=await swithpi('challenge',{walletAddress:wallet});if(c.transferRequired){if(!await confirm('이 Pi 지갑은 다른 Google 계정에 연결되어 있습니다. 지갑 소유권 인증을 완료하면 기존 계정의 인증이 해제되고 현재 Google 계정으로 연결됩니다. 계속 진행하시겠습니까?',{confirmLabel:'계속 진행'}))return;c=await swithpi('challenge',{walletAddress:wallet,transferConsent:true});}if(c.alreadyVerified)await refresh();else{setChallenge(c);setNow(Date.now());}});}}>
     <label className="field"><span>{t('Pi 테스트넷 지갑 주소')}</span><input required value={wallet} onChange={e=>setWallet(e.target.value)} placeholder="G…" maxLength={56} autoCapitalize="characters" autoCorrect="off" spellCheck={false}/></label>
     <button className="primary" disabled={busy||!wallet.trim()}>{busy?t('요청 생성 중…'):t('지갑 인증 시작')}</button>
    </form>}
    <div className="wallet-import"><button type="button" className="primary" disabled={busy} onClick={async()=>{
     if(importLock.current||busy)return;importLock.current=true;setBusy(true);setError('');setNotice('');
     try{const result=await swithpi('importPsl');if(!result?.identity)throw Error('요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');setChallenge(null);const next={...status,identity:result.identity};setStatus(next);onChange(next);await notify(result.alreadyVerified?'현재 계정에 이미 인증된 Pi 지갑입니다.':'PSL Mining 인증정보를 가져왔습니다.',{kind:'success',title:'가져오기 완료'});}
     catch(e){await notify(swithpiErrorKey(e),{kind:'error',title:'가져오기 실패'});}
     finally{importLock.current=false;setBusy(false);}
    }}>{busy?t('확인 중…'):t('PSL 채굴 인증정보 가져오기')}</button><p>{t('PSL Mining앱에서 이미 Pi 지갑 소유권 인증을 하셨으면, 해당 인증정보를 가져올 수 있습니다.')}</p><p>{t('두 앱에서 같은 Google 계정을 사용해야 합니다.')}</p></div>
   </>}
  </section>
  {identity&&<section className="wallet-card"><h3><Wallet/>{t('PSL 토큰 지갑 연결')}</h3><p>{t('PSL 에어드롭을 받을 SASEUL 지갑 주소를 입력하고 저장하세요.')}</p>
   <form onSubmit={e=>{e.preventDefault();if(!editing){setEditing(true);return;}void run(async()=>{await swithpi('savePsl',{address:psl});await refresh();setNotice('PSL 지갑 주소를 저장했습니다.');});}}>
    <label className="field"><span>{t('PSL 수령 지갑 주소')}</span>{editing?<input required value={psl} onChange={e=>setPsl(e.target.value)} minLength={44} maxLength={44} placeholder={t('44자리 SASEUL 주소')} autoCapitalize="none" autoCorrect="off" spellCheck={false}/>:<output className="wallet-address">{psl}</output>}</label>
    <button className="secondary" disabled={busy}>{busy?t('저장 중…'):editing?t('지갑주소 저장'):t('지갑주소 변경')}</button>
   </form><p className="form-help">{t('주소 저장은 소유권 인증이 아닙니다. 이미 신청한 이벤트의 수령 주소는 변경되지 않습니다.')}</p>
   <a className="wallet-link" href="https://wallet.pslmining.com/" target="_blank" rel="noopener noreferrer">{t('SASEUL 지갑 열기')}<ExternalLink size={15}/></a>
  </section>}
  </>}
 </Modal>;
}
