import { useEffect, useRef } from 'react';
export function useBackDismiss(enabled, onClose) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!enabled) return;
    const token = crypto.randomUUID();
    history.pushState({ ...history.state, communityOverlay: token }, '');
    const back = () => { if (history.state?.communityOverlay !== token) close.current(); };
    window.addEventListener('popstate', back);
    return () => {
      window.removeEventListener('popstate', back);
      if (history.state?.communityOverlay === token) history.back();
    };
  }, [enabled]);
}
