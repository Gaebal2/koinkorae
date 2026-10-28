import React, { useState, useSyncExternalStore } from 'react';
import { Check, Globe } from 'lucide-react';
import { getLanguage, subscribeLanguage, setLanguage, supportedLanguages, t } from './language.js';
import { Modal } from './ui.jsx';

export function LanguageSelector({ disabled = false, modalContainer }) {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="language-button header-control" disabled={disabled} aria-label={t('언어')} title={t('언어')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Globe aria-hidden="true"/></button>
    {open && <Modal title={t('언어')} onClose={() => setOpen(false)} className="language-modal" floating portalTarget={modalContainer?.current}>
      <p className="form-help">{t('앱에서 사용할 언어를 선택하세요')}</p>
      <div className="app-select-options language-options" role="group" aria-label={t('언어')}>
        {supportedLanguages.map(({code, name}) => <button key={code} type="button" lang={code} translate="no" className={language === code ? 'selected' : ''} aria-pressed={language === code} onClick={() => { setLanguage(code); setOpen(false); }}><span>{name}</span>{language === code && <Check aria-hidden="true"/>}</button>)}
      </div>
    </Modal>}
  </>;
}
