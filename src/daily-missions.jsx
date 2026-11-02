import React from 'react';
import {t} from './language.js';
import {POINTS_POLICY} from '../supabase/functions/_shared/points-policy.js';
import {useCheckinToday} from './checkin-calendar.jsx';
const labels={posts:'작성 피드',games:'배틀 완료',comments:'댓글 작성'};
export function DailyMissions({balance={},signedIn=false,login}) {
 const today=useCheckinToday(),mission=signedIn&&balance.mission?.day===today?balance.mission:{};
 const streak=signedIn&&balance.day>=today-1?balance.streak||0:0;
 return <><section className="policy-mission"><h2>{t('오늘의 일일 미션')} <span>+{POINTS_POLICY.missionReward} KK</span></h2><div className="mission-counts">{Object.entries(POINTS_POLICY.mission).map(([key,max])=><span key={key}>{t(labels[key]||'댓글 작성')} <b>{Math.min(mission[key]||0,max)}/{max}</b><small>+{POINTS_POLICY.missionRewards[key]} KK · {t(mission.rewarded?.[key]||mission.claimed?'지급 완료':'달성 시 지급')}</small></span>)}</div><p role="status">{mission.claimed?t('오늘의 미션 보상을 받았습니다.'):t('각 미션을 달성하면 해당 보상이 바로 지급됩니다.')}</p><small>{t('피드는 서로 다른 내용으로 10자 이상, 댓글은 서로 다른 피드에 5자 이상 작성해 주세요. 배틀은 10초 이상 플레이하고 1점 이상 획득한 뒤 종료해야 집계됩니다. 연습은 제외됩니다.')}</small><p>{t('현재 연속 출석 {0}일 · 누적 출석 {1}일',streak,signedIn?balance.stats?.days||0:0)}</p></section>{!signedIn&&<button className="secondary mission-login" onClick={login}>{t('로그인')}</button>}</>;
}
