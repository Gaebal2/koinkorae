import test from 'node:test';
import assert from 'node:assert/strict';
import { preferredLanguage, getLanguage, setLanguage, subscribeLanguage, t } from '../src/language.js';

test('Korean device defaults to Korean; every other language defaults to English', () => {
  for (const locale of ['ko', 'ko-KR', 'KO-kr']) assert.equal(preferredLanguage(null, locale), 'ko');
  for (const locale of ['en-US', 'ja-JP', 'zh-CN', 'de', '', undefined]) assert.equal(preferredLanguage(null, locale), 'en');
  assert.equal(preferredLanguage('en', 'ko-KR'), 'en');
  assert.equal(preferredLanguage('ko', 'ja-JP'), 'ko');
  assert.equal(preferredLanguage('invalid', 'ko-KR'), 'ko');
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
    setLanguage('ja');
    assert.equal(getLanguage(), 'ko');
    assert.equal(updates, 2);
  } finally { unsubscribe(); setLanguage(original); }
});
