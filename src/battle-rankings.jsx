import React,{useEffect,useRef,useState} from 'react';
import {Trophy} from 'lucide-react';
import {Modal,profileImage} from './ui.jsx';
import {data} from './data.js';
import {t,getLanguage} from './language.js';

function Participant({row,total,onProfile,mine=false}) {
  const percentage=total?row.total/total*100:0;
  return <article className={'battle-participant'+(mine?' is-mine':'')}>
    <div className="participant-head"><span className="participant-rank">{row.rank}</span><button className="participant-person" onClick={()=>onProfile?.(row.userId)}><img src={row.profileImage||profileImage()} alt=""/><strong>{row.username}</strong></button><b>{row.total.toLocaleString()}<small>{t('점')}</small></b></div>
    <div className="battle-meter" aria-label={t('지지 +{0}점, 반대 -{1}점',row.support,row.oppose)}><i style={{width:`${row.total?row.support/row.total*100:50}%`}}/><span>+{row.support.toLocaleString()}</span><span>−{row.oppose.toLocaleString()}</span></div>
    <div className="participant-meta"><span>{t('총 {0}게임',row.games.toLocaleString())}</span><span>{t('점유율 {0}%',percentage.toFixed(1))}</span></div>
    <time className="participant-time" dateTime={new Date(row.lastCompletedAt).toISOString()}>{t('마지막 완료')} · {new Date(row.lastCompletedAt).toLocaleString(getLanguage()==='ko'?'ko-KR':'en-US')}</time>
  </article>;
}

export function BattleRankings({postId,me,onClose,onProfile}) {
  const [result,setResult]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(false);
  const alive=useRef(false),locked=useRef(false);
  const load=async(cursor=null)=>{
    if(locked.current)return;locked.current=true;setLoading(true);setError(false);
    try{
      const next=await data.battleRankings(postId,cursor);
      if(alive.current)setResult(previous=>({...next,items:cursor?[...new Map([...(previous?.items||[]),...next.items].map(row=>[row.userId,row])).values()].slice(0,100):next.items}));
    }catch{if(alive.current)setError(true);}
    finally{locked.current=false;if(alive.current)setLoading(false);}
  };
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[]);
  const openProfile=id=>{onClose();onProfile?.(id);};
  return <Modal title={t('배틀 참여자 순위')} onClose={onClose} floating className="battle-rankings">
    <div className="ranking-summary"><Trophy/><div><strong>{t('전체 {0}명',result?.summary.participants.toLocaleString()??'—')}</strong><span>{t('총 배틀 점수 {0}점',result?.summary.total.toLocaleString()??'—')}</span></div></div>
    <p className="ranking-note">{t('지지·반대 점수의 절댓값 합계 순위입니다.')}</p>
    <p className="ranking-note">{t('새 집계 기능 적용 이후 피드에 반영한 배틀만 포함됩니다.')}</p>
    {me&&result&&<section className="my-battle-ranking"><h3>{t('내 기록')}</h3>{result.mine?<Participant row={result.mine} total={result.summary.total} mine onProfile={openProfile}/>:<p className="form-help">{t('아직 이 피드에 반영한 배틀이 없습니다.')}</p>}</section>}
    {result&&<><h3>{t('상위 100명')}</h3><div className="battle-ranking-list">{result.items.map(row=><Participant key={row.userId} row={row} total={result.summary.total} onProfile={openProfile}/>)}</div>{!result.items.length&&<p className="form-help">{t('첫 배틀 참여자가 되어 보세요.')}</p>}</>}
    {error&&<p className="error" role="alert">{t('순위를 불러오지 못했습니다.')} <button onClick={()=>load(result?.nextCursor??null)}>{t('다시 시도')}</button></p>}
    {loading?<p role="status">{t('불러오는 중…')}</p>:!error&&result?.nextCursor&&result.items.length<100?<button className="secondary ranking-more" onClick={()=>load(result.nextCursor)}>{t('20명 더 보기')}</button>:null}
  </Modal>;
}
