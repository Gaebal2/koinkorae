export function detectInAppBrowser(browser = {}) {
  if (browser.standalone) return null;
  const ua = browser.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (browser.platform === 'MacIntel' && browser.maxTouchPoints > 1);
  const apps = [[/KAKAOTALK/i, '카카오톡'], [/\bLine\//i, 'LINE'], [/FBAN|FBAV|FB_IAB|Messenger/i, '페이스북·메신저'], [/Instagram/i, '인스타그램'], [/NAVER/i, '네이버'], [/MicroMessenger/i, '위챗'], [/Telegram/i, '텔레그램']];
  const app = /DaumApps/i.test(ua) ? '다음' : apps.find(([pattern]) => pattern.test(ua))?.[1];
  const webview = /Android.*;\s*wv\b/i.test(ua) || (ios && /AppleWebKit/i.test(ua) && !/Safari|CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua));
  return app || webview ? { name: app || '앱 내 브라우저', ios, android: /Android/i.test(ua), kakao: /KAKAOTALK/i.test(ua) } : null;
}
export function externalBrowserUrl(href, browser) {
  const url = new URL(href);
  if (!/^https?:$/.test(url.protocol)) return null;
  if (!browser?.android) return null;
  const target = url.href.slice(url.protocol.length).replaceAll(';', '%3B');
  return `intent:${target}#Intent;scheme=${url.protocol.slice(0, -1)};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
}
export async function copyBrowserAddress(href, browser, input, document) {
  try {
    if (browser.clipboard?.writeText) {
      await browser.clipboard.writeText(href);
      return true;
    }
  } catch {}
  input.focus();
  input.select();
  input.setSelectionRange(0, input.value.length);
  try { return document.execCommand('copy'); } catch { return false; }
}
