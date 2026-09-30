import messages from './messages.en.json' with { type: 'json' };

export const languageKey = 'koinkorae.language';
export function preferredLanguage(saved, deviceLanguage) {
  return saved === 'ko' || saved === 'en' ? saved : /^ko(?:-|$)/i.test(deviceLanguage || '') ? 'ko' : 'en';
}
let saved;
try { saved = globalThis.localStorage?.getItem(languageKey); } catch {}
let language = preferredLanguage(saved, globalThis.navigator?.language);
const listeners = new Set();
export const getLanguage = () => language;
export const getLocale = () => language === 'ko' ? 'ko-KR' : 'en-US';
export const subscribeLanguage = callback => { listeners.add(callback); return () => listeners.delete(callback); };
export function setLanguage(value) {
  if (value !== 'ko' && value !== 'en') return;
  try { localStorage.setItem(languageKey, value); } catch {}
  language = value;
  if (globalThis.document) document.documentElement.lang = value;
  listeners.forEach(callback => callback());
}
if (globalThis.document) document.documentElement.lang = language;
// Translate UI copy only; never pass user-authored content through this function.
export function t(key, ...values) {
  if (typeof key !== 'string') return key;
  const text = language === 'en' ? messages[key] ?? key : key;
  return values.length ? text.replace(/\{(\d+)\}/g, (match, index) => values[index] ?? match) : text;
}
