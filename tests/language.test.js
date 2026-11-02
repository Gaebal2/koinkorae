import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POINT_ROWS, POINTS_POLICY } from '../supabase/functions/_shared/points-policy.js';
import { preferredLanguage, getLanguage, getLocale, setLanguage, subscribeLanguage, supportedLanguages, t } from '../src/language.js';

test('supported device locales are matched; unsupported languages fall back to Korean', () => {
  for (const locale of ['ko', 'ko-KR', 'KO-kr']) assert.equal(preferredLanguage(null, locale), 'ko');
  for (const [locale, code] of Object.entries({'en-US':'en','en-NG':'en','ja-JP':'ja','zh-CN':'zh-CN','zh-SG':'zh-CN','zh-Hant':'zh-TW','zh-HK':'zh-TW','zh-Hans-TW':'zh-CN','de':'de','vi-VN':'vi','id-ID':'id','in-ID':'id','hi-IN':'hi','fil-PH':'fil','tl-PH':'fil','VI_vn':'vi'})) assert.equal(preferredLanguage(null, locale), code, locale);
  for (const locale of ['fr-FR', 'ar', 'ha-NG', '', undefined]) assert.equal(preferredLanguage(null, locale), 'ko');
  assert.equal(preferredLanguage('en', 'ko-KR'), 'en');
  assert.equal(preferredLanguage('ko', 'ja-JP'), 'ko');
  assert.equal(preferredLanguage('invalid', 'ko-KR'), 'ko');
  for(const {code} of supportedLanguages) assert.equal(preferredLanguage(code,'unsupported'),code);
});

test('switching languages notifies consumers and translates parameters without changing their content', () => {
  const original = getLanguage();
  let updates = 0;
  const unsubscribe = subscribeLanguage(() => updates++);
  try {
    setLanguage('en');
    assert.equal(t('프로필 수정'), 'Edit profile');
    assert.equal(t('{0}님의 Feed', '한국어 닉네임'), "한국어 닉네임's feed");
    assert.equal(t('unknown key'), 'unknown key');
    setLanguage('ko');
    assert.equal(t('{0}님의 Feed', 'Alex'), 'Alex님의 Feed');
    setLanguage('invalid');
    assert.equal(getLanguage(), 'ko');
    assert.equal(updates, 2);
  } finally { unsubscribe(); setLanguage(original); }
});

test('all added catalogs cover UI copy and retain interpolation placeholders', () => {
  const read = path => JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8').replace(/^\uFEFF/,''));
  const source = {...read('../src/messages.en.json'),...read('../src/in-app-browser-messages.json')};
  const tokens = text => [...text.matchAll(/\{\d+\}/g)].map(match=>match[0]).sort();
  const original=getLanguage();
  try {
    for(const {code,locale} of supportedLanguages.filter(({code})=>!['ko','en'].includes(code))) {
      const catalog=read(`../src/locales/${code}.json`);
      setLanguage(code);
      assert.equal(getLocale(),locale);
      assert.deepEqual(Object.keys(catalog).sort(),Object.keys(source).sort(),code);
      for(const [key,value] of Object.entries(source)) {
        assert.ok(catalog[key]?.trim(),`${code}: ${key}`);
        assert.deepEqual(tokens(catalog[key]),tokens(value),`${code}: ${key}`);
        assert.doesNotMatch(catalog[key],/ZXQ\d+QXZ/);
      }
      assert.notEqual(t('프로필 수정'),'프로필 수정',code);
      assert.notEqual(t('보유 {0} KK · 포인트 정책 보기',12),'보유 12 KK · 포인트 정책 보기',code);
      assert.ok(t('{0}님의 Feed','한국어 닉네임').includes('한국어 닉네임'));
      assert.equal(t('사용자가 쓴 글'),'사용자가 쓴 글');
    }
  } finally {setLanguage(original);}
});

test('points policy labels and rank names have translations in every supported language', () => {
  const original=getLanguage();
  const keys=[...POINT_ROWS.flatMap(([name,,note])=>[name,note]),...POINTS_POLICY.levels.map(level=>level.name)];
  try {
    for(const {code} of supportedLanguages.filter(({code})=>code!=='ko')) {
      setLanguage(code);
      for(const key of keys)assert.notEqual(t(key),key,`${code}: ${key}`);
    }
  } finally {setLanguage(original);}
});

test('manual selection persists and updates the document even if storage is unavailable', () => {
  const original=getLanguage(), storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'), document=globalThis.document;
  const saved=new Map();
  try {
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{setItem:(key,value)=>saved.set(key,value)}});
    globalThis.document={documentElement:{lang:''}};
    setLanguage('vi');
    assert.equal(saved.get('koinkorae.language'),'vi');
    assert.equal(globalThis.document.documentElement.lang,'vi');
    globalThis.localStorage.setItem=()=>{throw Error('storage blocked');};
    assert.doesNotThrow(()=>setLanguage('id'));
    assert.equal(getLanguage(),'id');
    assert.equal(globalThis.document.documentElement.lang,'id');
  } finally {
    if(storage)Object.defineProperty(globalThis,'localStorage',storage); else delete globalThis.localStorage;
    if(document)globalThis.document=document; else delete globalThis.document;
    setLanguage(original);
  }
});

test('SwithPi, wallet and daily mission copy has native coverage in every supported language',async()=>{
 const {swithpiErrorMessages}=await import('../src/swithpi-errors.js');
 const overlay=JSON.parse(readFileSync(new URL('../src/swithpi.translations.json',import.meta.url),'utf8'));
 const files=['swithpi-page.jsx','pi-wallet.jsx','daily-missions.jsx'];
 const keys=new Set([...files.flatMap(file=>[...readFileSync(new URL('../src/'+file,import.meta.url),'utf8').matchAll(/'([^'\r\n]*[가-힣][^'\r\n]*)'/g)].map(m=>m[1])),...Object.values(swithpiErrorMessages)]);
 const placeholders=s=>[...s.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort();
 const original=getLanguage();
 try{
 for(const {code} of supportedLanguages.filter(l=>l.code!=='ko')){
  const catalog=code==='en'?{...JSON.parse(readFileSync(new URL('../src/messages.en.json',import.meta.url),'utf8')),...JSON.parse(readFileSync(new URL('../src/swithpi.en.json',import.meta.url),'utf8'))}:JSON.parse(readFileSync(new URL('../src/locales/'+code+'.json',import.meta.url),'utf8'));
  setLanguage(code);
  for(const key of keys){
   const value=overlay[key]?.[code]||catalog[key];
   assert.ok(value?.trim(),code+': '+key);
   assert.doesNotMatch(t(key),/[가-힣]/,code+': '+key);
   assert.deepEqual(placeholders(t(key)),placeholders(key),code+': '+key);
  }
 }
 }finally{setLanguage(original);}
});
test('wallet failures retain actionable causes without exposing raw server errors',async()=>{
 const {swithpiErrorKey,swithpiErrorMessages:m}=await import('../src/swithpi-errors.js');
 for(const [message,key] of [
 ['PSL 수령 지갑 주소를 먼저 저장해 주세요.','eligibility'],
 ['이미 다른 계정에서 인증한 지갑입니다.','duplicate'],
 ['30초 후 다시 요청해 주세요.','cooldown'],
 ['Failed to fetch','network'],
 ['이벤트 참여 조건을 확인해 주세요.','consent'],
 ['violates secret_database_constraint','fallback']
 ])assert.equal(swithpiErrorKey(new Error(message)),m[key]);
 for(const value of Object.values(m))assert.equal(swithpiErrorKey(value),value);
});
