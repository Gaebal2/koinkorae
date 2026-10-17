import React, { useRef, useState } from 'react';
import { detectInAppBrowser, externalBrowserUrl, copyBrowserAddress } from './in-app-browser.js';
import './in-app-browser.css';

export function InAppBrowserGuide({ children }) {
  const [browser] = useState(() => detectInAppBrowser(window.navigator));
  const [continued, setContinued] = useState(false);
  const [status, setStatus] = useState('');
  const address = useRef(null);
  const instructions = useRef(null);
  if (!browser || continued) return children;
  const href = window.location.href;
  function openExternal() {
    setStatus('열리지 않으면 아래 메뉴 안내를 이용하거나 주소를 복사해 주세요.');
    const target = externalBrowserUrl(href, browser);
    if (target) {
      try { window.location.assign(target); } catch { instructions.current?.focus(); }
    } else {
      instructions.current?.focus();
      instructions.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  async function copyAddress() {
    const copied = await copyBrowserAddress(href, navigator, address.current, document);
    setStatus(copied ? '주소를 복사했어요. 외부 브라우저의 주소창에 붙여넣어 주세요.' : '자동 복사가 지원되지 않아요. 선택된 주소를 길게 눌러 복사해 주세요.');
  }
  return <main className="external-browser-page">
    <section className="external-browser-card" aria-labelledby="external-browser-title">
      <span className="external-browser-brand">KOIN KORAE</span>
      <span className="external-browser-badge">{browser.name}에서 접속 중</span>
      <h1 id="external-browser-title">외부 브라우저에서<br/>열어 주세요</h1>
      <p>앱 안에서는 로그인이나 일부 기능이 제한될 수 있어요. 코인코래를 원활하게 이용하려면 Safari 또는 Chrome에서 열어 주세요.</p>
      <button type="button" className="external-browser-primary" onClick={openExternal}>외부 브라우저로 열기</button>
      <p className="external-browser-note">앱과 기기에 따라 바로 전환되지 않을 수 있어요.</p>
      <div className="external-browser-instructions" ref={instructions} tabIndex={-1}>
        <h2>버튼을 눌러도 열리지 않나요?</h2>
        <ol>
          <li>화면 상단 또는 하단의 <strong>⋮ ··· 메뉴</strong>나 <strong>공유 아이콘</strong>을 눌러 주세요.</li>
          <li><strong>{browser.ios ? 'Safari에서 열기' : '외부 브라우저로 열기'}</strong> 또는 <strong>다른 브라우저로 열기</strong>를 선택해 주세요.</li>
          <li>해당 메뉴가 없다면 아래 주소를 복사해 <strong>{browser.ios ? 'Safari' : 'Chrome 등 외부 브라우저'}</strong> 주소창에 붙여넣어 주세요.</li>
        </ol>
        <p className="external-browser-note">메뉴 위치와 이름은 앱 버전에 따라 다를 수 있어요.</p>
      </div>
      <label className="external-browser-label" htmlFor="external-browser-address">현재 페이지 주소</label>
      <input id="external-browser-address" ref={address} value={href} readOnly onFocus={event => event.target.select()}/>
      <button type="button" className="external-browser-copy" onClick={copyAddress}>주소 복사</button>
      <p className="external-browser-status" role="status">{status}</p>
      <button type="button" className="external-browser-continue" onClick={() => setContinued(true)}>이 브라우저에서 계속하기</button>
    </section>
  </main>;
}
