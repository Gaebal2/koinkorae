import React, { useSyncExternalStore } from 'react';
import { Languages } from 'lucide-react';
import { getLanguage, subscribeLanguage, setLanguage, t } from './language.js';

export function LanguageSettings() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  return <section className="language-settings">
    <div className="language-heading"><Languages size={20}/><span>{t('언어')}<small>{t('앱에서 사용할 언어를 선택하세요')}</small></span></div>
    <div className="language-toggle" role="group" aria-label={t('언어')}>
      <button type="button" lang="ko" aria-pressed={language === 'ko'} onClick={() => setLanguage('ko')}>한국어</button>
      <button type="button" lang="en" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
    </div>
  </section>;
}
