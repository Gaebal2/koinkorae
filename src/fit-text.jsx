import React, { useLayoutEffect, useRef } from 'react';

// Keep the control's geometry and inherited font size; shrink only its label
// when the translated text would otherwise overflow the available space.
export function FitText({ children }) {
  const box = useRef(null), label = useRef(null);
  useLayoutEffect(() => {
    let active = true;
    const fit = () => {
      if (!active || !box.current || !label.current) return;
      const outer = box.current, inner = label.current;
      inner.style.fontSize = '';
      const available = outer.getBoundingClientRect().width;
      const natural = inner.getBoundingClientRect().width;
      const base = parseFloat(getComputedStyle(outer).fontSize);
      if (available > 0 && natural > available) {
        inner.style.fontSize = `${Math.floor(base * available / natural * 100) / 100}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box.current);
    document.fonts?.ready.then(fit);
    document.fonts?.addEventListener('loadingdone', fit);
    return () => {
      active = false;
      observer.disconnect();
      document.fonts?.removeEventListener('loadingdone', fit);
    };
  }, [children]);
  return <span className="fit-text" ref={box}><span ref={label}>{children}</span></span>;
}
