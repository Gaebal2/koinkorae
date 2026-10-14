import React,{useEffect,useState} from 'react';
import {Swords,ChevronRight} from 'lucide-react';
import {BattleGames} from './battle-games.jsx';
import {gameLabels} from './arcade-extra.js';
import {GAME_KINDS} from './battle-engine.js';
import {AppSelect,Coin,cmcCoins} from './ui.jsx';
import {t} from './language.js';
import {data} from './data.js';
import {filterFeed} from './feed-model.js';

export function PracticePage({onShare}) {
  const [kind,setKind]=useState(null),[selectedCoin,setCoin]=useState(()=>{
    try {
      const saved=localStorage.getItem('koinkorae.practice.coin');
      return cmcCoins.some(c=>c.symbol===saved)?saved:null;
    } catch {return null;}
  });
  const coin=selectedCoin||cmcCoins[0].symbol;
  useEffect(()=>{
    if(selectedCoin)return;
    let active=true;
    const apply=symbol=>{
      if(active&&cmcCoins.some(c=>c.symbol===symbol))setCoin(current=>current||symbol);
    };
    if(!data.page){
      const stop=data.watchPosts(posts=>apply(filterFeed(posts,{category:'지지',period:'전체'}).groups[0]?.coin));
      return ()=>{active=false;stop();};
    }
    data.page({mode:'coins',category:'지지'}).then(page=>apply(page.items[0]?.coin)).catch(()=>{});
    return ()=>{active=false;};
  },[selectedCoin]);
  const selectCoin=value=>{
    setCoin(value);
    try {localStorage.setItem('koinkorae.practice.coin',value);} catch {}
  };
  return <main className="practice-page"><header className="practice-heading"><span className="practice-emblem"><Swords/></span><div><h1>{t('배틀 연습')}</h1><p>{t('원하는 게임을 연습하고 결과를 공유해 보세요.')}</p></div></header>
    <div className="practice-coin"><span>{t('캐릭터 코인')}</span><AppSelect title={t('캐릭터 코인')} value={coin} options={cmcCoins.map(c=>({value:c.symbol,label:c.symbol,coin:c.symbol}))} onChange={selectCoin} searchable floating/></div>
    <p className="form-help">{t('연습 점수는 피드에 반영되지 않습니다.')}</p>
    <div className="practice-list">{GAME_KINDS.map((value,index)=><button key={value} onClick={()=>setKind(value)}><span className={`practice-art practice-art-${value}`}><Coin symbol={coin}/><span>{String(index+1).padStart(2,'0')}</span></span><span><strong>{t(gameLabels[value][0])}</strong><small>{t(gameLabels[value][1])}</small></span><ChevronRight/></button>)}</div>
    {kind&&<BattleGames post={{coin}} practiceKind={kind} onClose={()=>setKind(null)} onShare={draft=>{setKind(null);onShare(draft);}}/>}
  </main>;
}
