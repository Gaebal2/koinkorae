import {ArrowDown, LoaderCircle, CircleAlert} from 'lucide-react';
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
    let start = null, amount = 0, running = false, active = true;
    setDistance(0); setBusy(false); setError(false);
    const reset = () => { start = null; amount = 0; if(active) setDistance(0); };
    const begin = event => {
      if(running || event.touches.length !== 1 || window.scrollY > 0 || !contentRefresh.has(page)) return;
      const target = event.target;
      if(target.closest('button, input, textarea, select, a, .overlay, .real-map, canvas, .direct-messages')) return;
      for(let el = target; el && el !== document.body; el = el.parentElement) {
        if(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) return;
      }
      start = {x:event.touches[0].clientX, y:event.touches[0].clientY};
    };
    const move = event => {
      if(!start) return;
      if(event.touches.length !== 1) { reset(); return; }
      const dx = event.touches[0].clientX-start.x, dy = event.touches[0].clientY-start.y;
      if(dy < 0 || Math.abs(dx) > Math.abs(dy)) { reset(); return; }
      if(event.cancelable) event.preventDefault();
      amount = Math.min(100, dy * .5); setDistance(amount);
    };
    const end = async () => {
      const refresh = start && amount >= 64; reset();
      if(!refresh || running) return;
      running = true; setBusy(true); setError(false);
      try { await contentRefresh.run(page); } catch { if(active) setError(true); }
      finally { running = false; if(active) setBusy(false); }
    };
    document.addEventListener('touchstart', begin, {passive:true});
    document.addEventListener('touchmove', move, {passive:false});
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', reset);
    return () => { active = false; document.removeEventListener('touchstart', begin); document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', reset); };
  }, [page]);
  if(!distance && !busy && !error) return null;
  const label = error ? t('새로고침하지 못했습니다. 다시 당겨 주세요.') : busy ? t('갱신 중…') : distance >= 64 ? t('놓으면 새로고침') : t('당겨서 새로고침');
  return <div className={'content-refresh-status'+(error ? ' has-error' : '')} role="status" aria-label={label}>
    {error ? <><CircleAlert aria-hidden="true"/><span>{label}</span></> : busy ? <LoaderCircle className="refresh-spinner" aria-hidden="true"/> : <ArrowDown style={{transform:distance >= 64 ? 'rotate(180deg)' : undefined}} aria-hidden="true"/>}
  </div>;
}
