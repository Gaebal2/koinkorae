import React from 'react';
import {t} from './language.js';
import './loading-indicator.css';
export function LoadingRing(){
 return <svg className="refresh-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle className="refresh-ring-arc" cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="42 57"/></svg>;
}
export function LoadingIndicator({label='불러오는 중…',inline=false}){
 return <span className={'loading-indicator'+(inline?' is-inline':'')} role="status" aria-label={t(label)}><LoadingRing/></span>;
}
export function QueryStatus({query}){
 return query.error?<div role="alert"><p>{t('목록을 불러오지 못했습니다.')}</p><button className="secondary" onClick={query.retry}>{t('다시 시도')}</button></div>:<LoadingIndicator/>;
}
