import React, { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { detectInAppBrowser, externalBrowserUrl, copyBrowserAddress } from './in-app-browser.js';
import { getLanguage, setLanguage, subscribeLanguage } from './language.js';
import messages from './in-app-browser-messages.json';
import './in-app-browser.css';

export function InAppBrowserGuide({ children }) {
  const [browser] = useState(() => detectInAppBrowser({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints, standalone: navigator.standalone || window.matchMedia('(display-mode: standalone)').matches }));
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  const translate = text => language === 'en' ? messages[text] ?? text : text;
  const [status, setStatus] = useState('아이폰에서는 메신저 메뉴를 통해 외부 브라우저를 열어 주세요.');
  const dialog = useRef(null);
  const address = useRef(null);
  const instructions = useRef(null);
  useLayoutEffect(() => {
    if (!browser) return;
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, [browser]);
  if (!browser) return children;
  const href = window.location.href;
  function openExternal() {
    setStatus('전환되지 않으면 메신저 메뉴의 “외부 브라우저로 열기”를 선택하거나 주소를 복사해 기본 브라우저에 붙여 넣어 주세요.');
    const target = externalBrowserUrl(href, browser);
    if (target) {
      try { window.location.assign(target); } catch { instructions.current?.focus(); }
    } else {
      instructions.current?.focus();
    }
  }
  async function copyAddress() {
    const copied = await copyBrowserAddress(href, navigator, address.current, document);
    setStatus(copied ? '주소를 복사했습니다. 기본 브라우저를 열고 주소창에 붙여 넣어 주세요.' : '아래 주소를 길게 눌러 복사한 뒤 기본 브라우저에서 열어 주세요.');
  }
  return <dialog ref={dialog} className="external-browser-dialog" aria-labelledby="external-browser-title" lang={language} onCancel={event => event.preventDefault()}>
    <div className="external-browser-header">
      <button className="external-browser-language" type="button" translate="no" aria-label={language === 'ko' ? '언어: 한국어. 영어로 전환' : 'Language: English. Switch to Korean'} onClick={() => setLanguage(language === 'ko' ? 'en' : 'ko')}>{language === 'ko' ? 'ENG' : '한국어'}</button>
    </div>
    <h2 id="external-browser-title">{translate('외부 브라우저에서 열어야 앱의 모든 기능을 사용할 수 있습니다.')}</h2>
    <button type="button" className="external-browser-button external-browser-primary" onClick={openExternal}>{translate('외부 브라우저로 열기')}</button>
    <button type="button" className="external-browser-button external-browser-copy" onClick={copyAddress}>{translate('주소 복사')}</button>
    <div ref={instructions} tabIndex={-1}>
      <p><strong>{translate('버튼으로 열리지 않나요?')}</strong></p>
      <ol>
        <li>{translate('카카오톡·텔레그램 화면의 메뉴(⋮ · …) 또는 공유 버튼을 누르세요.')}</li>
        <li>{translate('“외부 브라우저로 열기”, “브라우저에서 열기” 또는 “Safari로 열기”를 선택하세요. 메뉴 이름은 기기마다 다를 수 있습니다.')}</li>
        <li>{translate('해당 메뉴가 없으면 주소를 복사해 기본 브라우저 주소창에 붙여 넣으세요.')}</li>
      </ol>
    </div>
    <p role="status" aria-live="polite">{translate(status)}</p>
    <label htmlFor="external-browser-address">{translate('지갑 사이트 주소')}</label>
    <input id="external-browser-address" type="text" ref={address} value={href} readOnly onFocus={event => event.target.select()}/>
  </dialog>;
}
