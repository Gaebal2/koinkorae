import {RankBadge} from './rank-badge.jsx';
﻿import React,{useEffect,useState} from 'react';
import {Trophy, Coins, ArrowLeft} from 'lucide-react';
import {t} from './language.js';
import {POINTS_POLICY,POINT_ROWS,levelFor} from '../supabase/functions/_shared/points-policy.js';
import {useCheckinToday} from './checkin-calendar.jsx';
const labels={days:'출석일',bp:'누적 KK',posts:'작성 피드',reposts:'리포스트',games:'배틀 완료',likes:'받은 좋아요'};
const fmt=n=>Number(n||0).toLocaleString();
export function PointsPolicy({balance={current:0,lifetime:0},me,onBack,login}) {
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[]);
 const today=useCheckinToday(),level=levelFor(balance);
 const mission=balance.mission?.day===today?balance.mission:{};
 const streak=balance.day>=today-1?balance.streak||0:0;
 const [selection,setSelection]=useState(null);
 const selected=selection??Math.min(level.index+1,POINTS_POLICY.levels.length-1),target=POINTS_POLICY.levels[selected];
 const values={days:balance.stats?.days||0,bp:balance.lifetime||0,posts:balance.stats?.posts||0,reposts:balance.stats?.reposts||0,games:balance.stats?.games||0,likes:balance.stats?.likes||0};
 const rankCard=<section className="points-policy policy-rank-card"><h2>{t('등급 배지')}</h2><p>{t('선택한 등급의 모든 조건을 충족해야 합니다. 출석은 누적 출석일, 포인트는 누적 KK 기준입니다. 받은 좋아요는 본인을 제외한 사용자와 피드의 조합당 한 번 집계합니다. 배틀 횟수는 새 정책 적용 이후의 완료 기록부터 집계합니다.')}</p><div className="rank-collection" aria-label={t('등급 배지')}>{POINTS_POLICY.levels.map((rank,i)=><button type="button" key={rank.name} aria-pressed={selected===i} onClick={()=>setSelection(i)} data-earned={!!me&&level.index>=i}><RankBadge level={i}/><b>{t(rank.name)}</b><small>{me&&level.index>=i?t('획득'):t('도전')}</small></button>)}</div>
 <section className="policy-progress" aria-live="polite"><h2>{t(selection===null&&level.next?'다음 등급: {0}':'선택 등급: {0}',t(target.name))}</h2><div className="level-progress-grid">{Object.entries(values).map(([key,value])=><div key={key} data-complete={!!me&&value>=target[key]}><span>{t(labels[key])}</span><b>{me?fmt(value)+' / ':''}{fmt(target[key])}</b>{me&&<progress value={Math.min(value,target[key])} max={target[key]||1} aria-label={t(labels[key])}/>}</div>)}</div></section></section>;
 return <main className="points-policy-page">
  <div className="policy-heading"><button className="policy-back" onClick={onBack} aria-label={t('이전 화면')}><ArrowLeft/></button><div><h1>{t('포인트 정책')}</h1><p>{t('내 KK 현황과 활동별 포인트 기준')}</p></div></div>
  {me?<>
   <div className="policy-summary">
    <section className="balance-card" aria-label={t('보유 KK')}><span><Coins size={18}/>{t('보유 KK')}</span><strong>{fmt(balance.current)} <small>KK</small></strong><small>{t('현재 사용할 수 있는 포인트')}</small></section>
    <section className="tier-card" aria-label={t('현재 등급과 누적 KK')}><Trophy/><div><small>{t('현재 등급')}</small><b>{t(level.current.name)}</b><span>{t('누적 {0} KK',fmt(balance.lifetime))}</span><span>{t('출석 추가 +{0} KK · 마커 최대 {1}개',level.current.bonus,level.current.pins)}</span></div><i style={{width:`${level.progress}%`}}/></section>
   </div>
   {rankCard}
   <section className="policy-mission"><h2>{t('오늘의 일일 미션')} <span>+{POINTS_POLICY.missionReward} KK</span></h2><div className="mission-counts">{Object.entries(POINTS_POLICY.mission).map(([key,max])=><span key={key}>{t(labels[key]||'댓글 작성')} <b>{mission[key]||0}/{max}</b></span>)}</div><p role="status">{mission.claimed?t('오늘의 미션 보상을 받았습니다.'):t('세 가지를 모두 달성하면 자동으로 지급됩니다.')}</p><small>{t('피드는 서로 다른 내용으로 10자 이상, 댓글은 서로 다른 피드에 5자 이상 작성해 주세요. 배틀은 10초 이상 플레이하고 1점 이상 획득한 뒤 종료해야 집계됩니다. 연습은 제외됩니다.')}</small><p>{t('현재 연속 출석 {0}일 · 누적 출석 {1}일',streak,balance.stats?.days||0)}</p></section>
  </>:<section className="policy-guest"><p>{t('로그인하면 보유 KK와 등급, 미션 진행 상황을 확인할 수 있습니다.')}</p><button className="primary" onClick={login}>{t('로그인')}</button></section>}
  {!me && rankCard}
  <section className="points-policy">
   <h2>{t('포인트 지급·사용 기준')}</h2><p>{t('보유 KK는 사용 가능한 잔액이며, 누적 KK는 지금까지 받은 포인트입니다. KK를 사용해도 누적 KK와 달성한 등급은 내려가지 않습니다.')}</p>
   <div className="policy-table-scroll" tabIndex={0} role="region" aria-label={t('포인트 지급·사용 기준')}><table><thead><tr><th scope="col">{t('항목')}</th><th scope="col">KK</th><th scope="col">{t('적용 기준')}</th></tr></thead><tbody>{POINT_ROWS.map(([name,amount,note])=><tr key={name}><th scope="row">{t(name)}</th><td className={amount>0?'bp-earn':amount<0?'bp-spend':''}>{amount>0?'+':''}{fmt(amount)}</td><td>{t(note)}</td></tr>)}</tbody></table></div>
   <p className="policy-note">{t('출석과 일일 미션은 한국 시간 00시에 초기화됩니다. 출석을 하루 놓치면 연속 출석은 1일부터 다시 시작합니다. 10·30·100·365일 보상은 각 달성일에 한 번씩 지급됩니다. 활동을 삭제해도 사용한 KK는 환불되지 않습니다.')}</p>
   <h2>{t('레벨별 적용 혜택')}</h2><div className="policy-table-scroll" tabIndex={0} role="region" aria-label={t('레벨별 적용 혜택')}><table><thead><tr><th>{t('등급')}</th><th>{t('출석 추가 KK')}</th><th>{t('마커 생성 한도')}</th><th>{t('프로필 이미지')}</th></tr></thead><tbody>{POINTS_POLICY.levels.map(l=><tr key={l.name}><th scope="row">{t(l.name)}</th><td>+{l.bonus}</td><td>{t('{0}개',l.pins)}</td><td>{t(l.avatar)}</td></tr>)}</tbody></table></div>
   <details className="policy-planned"><summary>{t('준비 중인 레벨별 권한')}</summary><p>{t('아래 항목은 예정 기준이며 아직 제한하거나 제공하지 않습니다. 현재 프로필 사진 변경과 팔로우는 모든 등급에서 가능하고, DM은 맞팔친구에게 보낼 수 있습니다. 마커 사진은 1장까지 지원합니다.')}</p><div className="policy-table-scroll" tabIndex={0} role="region" aria-label={t('준비 중인 레벨별 권한')}><table><thead><tr>{['등급','프로필 배경','친구 요청 (명)','DM (명)','마커 이미지 (개)'].map(x=><th key={x}>{t(x)}</th>)}</tr></thead><tbody>{POINTS_POLICY.levels.map(l=><tr key={l.name}><th scope="row">{t(l.name)}</th><td>{t(l.cover)}</td><td>{l.friends??t('무제한')}</td><td>{l.dm??t('무제한')}</td><td>{l.images}</td></tr>)}</tbody></table></div></details>
  </section>
 </main>;
}
