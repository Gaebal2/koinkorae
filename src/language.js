import messages from './messages.en.json' with { type: 'json' };
import browserMessages from './in-app-browser-messages.json' with { type: 'json' };
import zhCN from './locales/zh-CN.json' with { type: 'json' };
import zhTW from './locales/zh-TW.json' with { type: 'json' };
import vi from './locales/vi.json' with { type: 'json' };
import id from './locales/id.json' with { type: 'json' };
import hi from './locales/hi.json' with { type: 'json' };
import fil from './locales/fil.json' with { type: 'json' };
import ja from './locales/ja.json' with { type: 'json' };
import de from './locales/de.json' with { type: 'json' };

export const supportedLanguages = Object.freeze([
  {code:'ko', name:'한국어', locale:'ko-KR'},
  {code:'en', name:'English', locale:'en-US'},
  {code:'zh-CN', name:'简体中文', locale:'zh-CN'},
  {code:'zh-TW', name:'繁體中文', locale:'zh-TW'},
  {code:'vi', name:'Tiếng Việt', locale:'vi-VN'},
  {code:'id', name:'Bahasa Indonesia', locale:'id-ID'},
  {code:'hi', name:'हिन्दी', locale:'hi-IN'},
  {code:'fil', name:'Filipino', locale:'fil-PH'},
  {code:'ja', name:'日本語', locale:'ja-JP'},
  {code:'de', name:'Deutsch', locale:'de-DE'},
]);
const dictionaries = {en:{...messages,...browserMessages},'zh-CN':zhCN,'zh-TW':zhTW,vi,id,hi,fil,ja,de};
const isSupported = code => supportedLanguages.some(item => item.code === code);
export function deviceLanguageCode(value) {
  const locale = String(value || '').replaceAll('_','-').toLowerCase();
  const [base, ...parts] = locale.split('-');
  if(base === 'zh') {
    if(parts.includes('hant')) return 'zh-TW';
    if(parts.includes('hans')) return 'zh-CN';
    return parts.some(part => ['tw','hk','mo'].includes(part)) ? 'zh-TW' : 'zh-CN';
  }
  if(base === 'tl') return 'fil';
  if(base === 'in') return 'id';
  return isSupported(base) ? base : 'ko';
}

export const languageKey = 'koinkorae.language';
export function preferredLanguage(saved, deviceLanguage) {
  return isSupported(saved) ? saved : deviceLanguageCode(deviceLanguage);
}
let saved;
try { saved = globalThis.localStorage?.getItem(languageKey); } catch {}
let language = preferredLanguage(saved, globalThis.navigator?.languages?.[0] || globalThis.navigator?.language);
const listeners = new Set();
export const getLanguage = () => language;
export const getLocale = () => supportedLanguages.find(item => item.code === language).locale;
export const subscribeLanguage = callback => { listeners.add(callback); return () => listeners.delete(callback); };
export function setLanguage(value) {
  if (!isSupported(value)) return;
  try { localStorage.setItem(languageKey, value); } catch {}
  language = value;
  if (globalThis.document) document.documentElement.lang = value;
  listeners.forEach(callback => callback());
}
if (globalThis.document) document.documentElement.lang = language;
// Translate UI copy only; never pass user-authored content through this function.
export function t(key, ...values) {
  if (typeof key !== 'string') return key;
  const text = dictionaries[language]?.[key] ?? key;
  return values.length ? text.replace(/\{(\d+)\}/g, (match, index) => values[index] ?? match) : text;
}
