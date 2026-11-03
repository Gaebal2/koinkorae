import React from 'react';
import {CircleHelp} from 'lucide-react';
import {useFeedback} from './feedback.jsx';
import {t} from './language.js';
import {POINTS_POLICY} from '../supabase/functions/_shared/points-policy.js';
import {useCheckinToday} from './checkin-calendar.jsx';
const labels={posts:'작성 피드',games:'배틀 완료',comments:'댓글 작성'};
const descriptions={
 posts:'피드는 서로 다른 내용으로 10자 이상 작성해 주세요.',
 games:'배틀은 10초 이상 플레이하고 1점 이상 획득한 뒤 종료해야 집계됩니다. 연습은 제외됩니다.',
 comments:'댓글은 서로 다른 피드에 5자 이상 작성해 주세요.',
};
export function DailyMissions({balance={},signedIn=false,login}) {
 const {notify}=useFeedback();
 const today=useCheckinToday(),mission=signedIn&&balance.mission?.day===today?balance.mission:{};
 return <><section className="policy-mission"><h2>{t('오늘의 일일 미션')} <span>+{POINTS_POLICY.missionReward} KK</span></h2><div className="mission-counts">{Object.entries(POINTS_POLICY.mission).map(([key,max])=><div className="mission-item" key={key}><div className="mission-item-content"><div className="mission-item-heading"><span>{t(labels[key])}</span><b>{Math.min(mission[key]||0,max)}/{max}</b></div><small>+{POINTS_POLICY.missionRewards[key]} KK · {t(mission.rewarded?.[key]||mission.claimed?'지급 완료':'달성 시 지급')}</small></div><button type="button" className="mission-help" aria-label={t('{0} 미션 안내',t(labels[key]))} onClick={()=>void notify(descriptions[key],{title:labels[key]})}><CircleHelp aria-hidden="true"/></button></div>)}</div><p role="status">{mission.claimed?t('오늘의 미션 보상을 받았습니다.'):t('각 미션을 달성하면 해당 보상이 바로 지급됩니다.')}</p></section>{!signedIn&&<button className="secondary mission-login" onClick={login}>{t('로그인')}</button>}</>;
}
