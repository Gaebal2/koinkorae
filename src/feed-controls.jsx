import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Segments } from './ui.jsx';
import { t } from './language.js';

export function FeedControls({ options, setOptions }) {
  const select = (key, items) => <div className={`feed-select feed-select-${key}`}>
    <select aria-label={t(key === 'category' ? '피드 정렬' : '기간 선택')} value={options[key]} onChange={event => setOptions({ ...options, [key]: event.target.value })}>
      {items.map(item => <option key={item} value={item}>{t(item)}</option>)}
    </select>
    <ChevronDown aria-hidden="true"/>
  </div>;
  return <div className="feed-controls">
    <div className="feed-toggle"><Segments items={['유저 피드', '코인 피드']} value={options.feed} onChange={feed => setOptions({ ...options, feed })}/></div>
    {select('category', ['최신', '좋아요', '지지', '팔로잉', '급상승', '논쟁'])}
    {select('period', ['오늘', '이번 달', '올해', '전체'])}
  </div>;
}
