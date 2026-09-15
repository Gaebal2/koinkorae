import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleAlert, Info, X } from 'lucide-react';

const FeedbackContext = createContext(null);
export function FeedbackProvider({ children }) {
  const queue = useRef([]), active = useRef(null);
  const [current, setCurrent] = useState(null);
  const showNext = useCallback(() => { active.current = queue.current.shift() || null; setCurrent(active.current); }, []);
  const ask = useCallback(options => {
    const duplicate = [active.current, ...queue.current].find(item => item && item.message === options.message && item.kind === options.kind);
    if (duplicate) return duplicate.promise;
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    queue.current.push({ ...options, resolve, promise, returnFocus: options.returnFocus || document.activeElement });
    if (!active.current) showNext();
    return promise;
  }, [showNext]);
  const notify = useCallback((message, options = {}) => ask({ kind: 'info', title: '알림', ...options, message: String(message) }), [ask]);
  const confirm = useCallback((message, options = {}) => ask({ kind: 'confirm', title: '확인해 주세요', confirmLabel: '확인', ...options, message: String(message) }), [ask]);
  const close = useCallback(result => {
    const item = active.current;
    if (!item) return;
    item.resolve(result); showNext();
    if (!active.current) requestAnimationFrame(() => { if (item.returnFocus?.isConnected) item.returnFocus.focus(); });
  }, [showNext]);
  useEffect(() => {
    const invalid = event => {
      event.preventDefault();
      if (active.current) return;
      const input = event.target;
      const label = input.closest('label')?.querySelector('span')?.textContent;
      void notify(`${label ? `${label}: ` : ''}${input.validationMessage}`, { kind: 'error', title: '입력을 확인해 주세요', returnFocus: input });
    };
    document.addEventListener('invalid', invalid, true);
    return () => { document.removeEventListener('invalid', invalid, true); };
  }, [notify]);
  return <FeedbackContext.Provider value={{ notify, confirm }}><div className="feedback-content" inert={current ? true : undefined}>{children}</div>{current && createPortal(<FeedbackDialog item={current} close={close}/>, document.body)}</FeedbackContext.Provider>;
}

function FeedbackDialog({ item, close }) {
  const element = useRef(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.current.querySelector('[data-initial-focus]')?.focus();
    return () => { document.body.style.overflow = previous; };
  }, [item]);
  const Icon = item.kind === 'success' ? Check : item.kind === 'error' ? CircleAlert : Info;
  return <div className="feedback-backdrop"><section ref={element} className={`feedback-dialog feedback-${item.kind}`} role="alertdialog" aria-modal="true" aria-labelledby="feedback-title" aria-describedby="feedback-description" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(false); }
    if (event.key === 'Tab') {
      const buttons = [...element.current.querySelectorAll('button')], first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}><button className="feedback-close" aria-label="알림 닫기" onClick={() => close(false)}><X/></button><div className="feedback-symbol"><Icon/></div><h2 id="feedback-title">{item.title}</h2><p id="feedback-description">{item.message}</p><div className="feedback-actions">
    {item.kind === 'confirm' && <button className="secondary" data-initial-focus onClick={() => close(false)}>{item.cancelLabel || '취소'}</button>}
    <button className="primary" data-initial-focus={item.kind !== 'confirm' ? true : undefined} onClick={() => close(true)}>{item.confirmLabel || '확인'}</button>
  </div></section></div>;
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw Error('FeedbackProvider is required.');
  return context;
}

// Route existing component error/message setters through the same popup queue.
export function useAppMessage({ title = '알림', kind = 'error' } = {}) {
  const { notify } = useFeedback(), last = useRef('');
  const setMessage = useCallback(value => {
    const message = typeof value === 'function' ? value(last.current) : value;
    if (!message) { last.current = ''; return; }
    if (last.current === message) return;
    last.current = message;
    void notify(message, { title, kind }).then(() => { if (last.current === message) last.current = ''; });
  }, [notify, title, kind]);
  return ['', setMessage];
}
