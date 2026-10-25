import {CircleAlert} from 'lucide-react';
import React, {useEffect, useRef, useState} from 'react';
import {contentRefresh} from './content-refresh.js';
import {t} from './language.js';
export function useContentRefresh(page, callback, enabled = true) {
  const latest = useRef(callback); latest.current = callback;
  useEffect(() => enabled ? contentRefresh.subscribe(page, () => latest.current()) : undefined, [page, enabled]);
}
export function ContentRefresh({page}) {
  const [distance, setDistance] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  useEffect(() => {
    let start = null, amount = 0, running = false, active = true, suppressClickUntil = 0;
    setDistance(0); setBusy(false); setError(false);
    const reset = () => { start = null; amount = 0; if(active) setDistance(0); };
    const begin = event => {
      reset(); suppressClickUntil = 0;
      if(running || event.touches.length !== 1 || window.scrollY > 0 || !contentRefresh.has(page)) return;
      const target = event.target;
      if(target.closest('input, textarea, select, [contenteditable="true"], .overlay, .real-map, canvas, .direct-messages')) return;
      if(page !== 'home' && target.closest('button:not(.post-image), a')) return;
      for(let el = target; el && el !== document.body; el = el.parentElement) {
        if(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) return;
      }
      start = {x:event.touches[0].clientX, y:event.touches[0].clientY};
    };
    const move = event => {
      if(!start) return;
      if(event.touches.length !== 1) { reset(); return; }
      const dx = event.touches[0].clientX-start.x, dy = event.touches[0].clientY-start.y;
      if(Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if(dy < 0 || Math.abs(dx) > Math.abs(dy)) { reset(); return; }
      suppressClickUntil = Date.now() + 700;
      if(event.cancelable) event.preventDefault();
      amount = Math.min(100, dy * .5); setDistance(amount);
    };
    const end = async () => {
      const refresh = start && amount >= 64;
      if(start && amount > 0) suppressClickUntil = Date.now() + 700;
      reset();
      if(!refresh || running) return;
      running = true; setBusy(true); setError(false);
      try { await contentRefresh.run(page); } catch { if(active) setError(true); }
      finally { running = false; if(active) setBusy(false); }
    };
    const suppressClick = event => { if(Date.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); } };
    document.addEventListener('click', suppressClick, true);
    document.addEventListener('touchstart', begin, {passive:true, capture:true});
    document.addEventListener('touchmove', move, {passive:false, capture:true});
    document.addEventListener('touchend', end, true);
    document.addEventListener('touchcancel', reset, true);
    return () => { active = false; document.removeEventListener('click', suppressClick, true); document.removeEventListener('touchstart', begin, true); document.removeEventListener('touchmove', move, true); document.removeEventListener('touchend', end, true); document.removeEventListener('touchcancel', reset, true); };
  }, [page]);
  if(!distance && !busy && !error) return null;
  const label = error ? t('새로고침하지 못했습니다. 다시 당겨 주세요.') : busy ? t('갱신 중…') : distance >= 64 ? t('놓으면 새로고침') : t('당겨서 새로고침');
  return <div className={'content-refresh-status'+(error ? ' has-error' : '')} role="status" aria-label={label} style={error ? undefined : {transform:`translate(-50%, ${busy ? 12 : Math.min(distance,64)-36}px)`, opacity:busy ? 1 : Math.min(1,distance/24)}}>
    {error ? <><CircleAlert aria-hidden="true"/><span>{label}</span></> : <svg className={busy ? "refresh-spinner" : "refresh-pull-ring"} viewBox="0 0 24 24" aria-hidden="true" style={busy ? undefined : {transform:`rotate(${distance*4}deg)`}}><circle className={busy ? "refresh-ring-arc" : undefined} cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={busy ? "42 57" : `${Math.max(4,Math.min(distance/64,1)*48)} 57`}/></svg>}
  </div>;
}
