import test from 'node:test';
import assert from 'node:assert/strict';
import { detectInAppBrowser, externalBrowserUrl, copyBrowserAddress } from './in-app-browser.js';

test('messengers and embedded browsers are detected, ordinary browsers are excluded', () => {
  for (const marker of ['KAKAOTALK', 'Line/14.0', 'FBAN/Messenger', 'Instagram', 'NAVER', 'MicroMessenger', 'Telegram', 'DaumApps']) {
    assert.ok(detectInAppBrowser({ userAgent: `Mozilla/5.0 iPhone AppleWebKit/605 Safari/604 ${marker}` }), marker);
  }
  assert.ok(detectInAppBrowser({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel; wv) AppleWebKit/537 Chrome/120 Safari/537' }));
  assert.ok(detectInAppBrowser({ userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605 Mobile/15' }));
  for (const ua of ['Mozilla/5.0 (iPhone) AppleWebKit/605 Version/18 Mobile/15 Safari/604', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537 Chrome/120 Mobile Safari/537', 'Mozilla/5.0 (iPhone) AppleWebKit/605 CriOS/120 Mobile/15 Safari/604', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537']) {
    assert.equal(detectInAppBrowser({ userAgent: ua }), null);
  }
  assert.equal(detectInAppBrowser({ userAgent: 'KAKAOTALK', standalone: true }), null);
});

test('external links preserve shared path, query and hash with safe Intent options', () => {
  const href = 'https://koinkorae.com/posts/a?post=abc&name=%ED%95%9C#comment;end';
  assert.equal(externalBrowserUrl(href, { kakao: true, ios: true }), null);
  const intent = externalBrowserUrl(href, { android: true });
  assert.ok(intent.startsWith('intent://koinkorae.com/posts/a?post=abc&name=%ED%95%9C#comment%3Bend#Intent;'));
  assert.ok(intent.endsWith('action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end'));
  assert.ok(!intent.includes('package='));
  assert.equal(externalBrowserUrl(href, { kakao: true, android: true }), intent);
  assert.equal(externalBrowserUrl(href, { ios: true }), null);
  assert.equal(externalBrowserUrl('javascript:alert(1)', { kakao: true }), null);
});

test('copy uses clipboard and selects address when clipboard access is denied', async () => {
  const href = 'https://koinkorae.com/?post=123';
  let copied;
  assert.equal(await copyBrowserAddress(href, { clipboard: { writeText: async value => { copied = value; } } }), true);
  assert.equal(copied, href);
  let selected = false;
  const input = { value: href, focus() {}, select() { selected = true; }, setSelectionRange(start, end) { assert.equal(end, href.length); } };
  assert.equal(await copyBrowserAddress(href, { clipboard: { writeText: async () => { throw Error('denied'); } } }, input, { execCommand: () => false }), false);
  assert.equal(selected, true);
  assert.equal(await copyBrowserAddress(href, {}, input, { execCommand: () => true }), true);
});
