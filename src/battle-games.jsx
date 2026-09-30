import { t } from './language.js';
import {gameLabels,drawExtra} from './arcade-extra.js';
import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, Trophy } from 'lucide-react';
import { Modal } from './ui.jsx';
import { createRelativeDrag } from './relative-drag.js';
import { drawCoinCharacter } from './battle-character.js';
import { coinImage } from './coin-artwork.js';
import { jump, step, moveBouncePlayer, MOVE_SCALE, WIDTH, HEIGHT, GROUND } from './battle-engine.js';

import { TICK } from '../functions/battle-validation.js';
import { battleRandom, CHECKPOINT_TICKS, newBattleProgress } from '../functions/battle-progress.js';
import {capturePracticeResult} from './practice-result.js';
import { useLiveProfile } from './live-profile.js';
import { data } from './data.js';
import { useFeedback } from './feedback.jsx';
function draw(context, game, icon, symbol) {
  const drawPlayer=(ctx,x,y)=>drawCoinCharacter(ctx,{x,y,icon,symbol,kind:game.kind,time:game.time,airborne:game.airborne || game.velocity!==0});
  if(drawExtra(context,game,WIDTH,HEIGHT,drawPlayer))return;
  const bird = game.kind === 'flappy';
  context.clearRect(0, 0, WIDTH, HEIGHT);
  const sky = context.createLinearGradient(0, 0, 0, HEIGHT); sky.addColorStop(0, '#eeebff'); sky.addColorStop(1, '#fafaff');
  context.fillStyle = sky; context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) { const x = (i * 115 + 390 - game.time * 16) % 460 - 40; context.beginPath(); context.ellipse(x, 65 + i % 2 * 44, 31, 10, 0, 0, Math.PI * 2); context.fill(); }
  for (const obstacle of game.obstacles) {
    context.fillStyle = bird ? '#7157ff' : '#5137e8';
    if (bird) {
      context.fillRect(obstacle.x, 0, obstacle.w, obstacle.gap - 76);
      context.fillRect(obstacle.x - 3, obstacle.gap - 91, obstacle.w + 6, 15);
      context.fillRect(obstacle.x, obstacle.gap + 76, obstacle.w, GROUND - obstacle.gap - 76);
      context.fillRect(obstacle.x - 3, obstacle.gap + 76, obstacle.w + 6, 15);
      context.fillStyle = '#a997ff'; context.fillRect(obstacle.x + 7, 0, 5, Math.max(0, obstacle.gap - 91));
      context.fillRect(obstacle.x + 7, obstacle.gap + 91, 5, Math.max(0, GROUND - obstacle.gap - 91));
      context.fillStyle = '#5137ce'; context.fillRect(obstacle.x + obstacle.w - 7, 0, 7, Math.max(0, obstacle.gap - 91));
      context.fillRect(obstacle.x + obstacle.w - 7, obstacle.gap + 91, 7, Math.max(0, GROUND - obstacle.gap - 91));
      context.fillStyle = '#b7a8ff'; context.fillRect(obstacle.x - 3, obstacle.gap - 91, obstacle.w + 6, 3);
      context.fillRect(obstacle.x - 3, obstacle.gap + 76, obstacle.w + 6, 3);
    } else {
      context.fillRect(obstacle.x + obstacle.w * .35, GROUND - obstacle.h, obstacle.w * .32, obstacle.h);
      context.fillRect(obstacle.x, GROUND - obstacle.h * .7, obstacle.w, 7);
      context.fillRect(obstacle.x, GROUND - obstacle.h * .88, 6, obstacle.h * .3);
      context.fillRect(obstacle.x + obstacle.w - 6, GROUND - obstacle.h * .95, 6, obstacle.h * .3);
    }
  }
  context.fillStyle = '#baf7d0'; context.fillRect(0, GROUND, WIDTH, HEIGHT - GROUND);
  context.fillStyle = '#9adab1'; context.fillRect(0, GROUND, WIDTH, 3);
  if (bird) {
    context.save();context.translate(87,game.y);context.rotate(Math.max(-.4,Math.min(.6,game.velocity/650)));drawPlayer(context,0,0,28);context.restore();
  } else drawPlayer(context,76,game.y+15);
}

export function BattleGames({ post, onClose, practiceKind, onShare }) {
  const practice=!!practiceKind;
  const { confirm, notify } = useFeedback(), author=useLiveProfile(practice?null:post.authorId);
  const [session,setSession]=useState(null),[mode,setMode]=useState('choose'),[display,setDisplay]=useState({score:0,time:0});
  const [applying,setApplying]=useState(false);
  const [busy,setBusy]=useState(false),[syncing,setSyncing]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
  const canvas=useRef(null),game=useRef(null),random=useRef(null),inputs=useRef([]),ticks=useRef(0),banked=useRef(0),revision=useRef(0),packets=useRef([]),pumping=useRef(null),locked=useRef(false),request=useRef(null),sessionRef=useRef(null),mounted=useRef(true);
  const drag=useRef(createRelativeDrag()), heldKeys=useRef(new Set());
  const pendingAction=useRef(false), playerIcon=useRef(null);
  useEffect(()=>{const image=new Image();playerIcon.current=image;image.onload=()=>{const ctx=canvas.current?.getContext("2d");if(ctx&&game.current)draw(ctx,game.current,image,post.coin);};image.src=coinImage(post.coin);return()=>{image.onload=null;};},[post.coin]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const side=session?.side,kind=session?.kind;
  useEffect(()=>{
    const surface=canvas.current;if(!surface)return;
    const prevent=event=>{if(event.cancelable)event.preventDefault();};
    surface.addEventListener('touchstart',prevent,{passive:false});
    surface.addEventListener('touchmove',prevent,{passive:false});
    surface.addEventListener('contextmenu',prevent);
    surface.addEventListener('selectstart',prevent);
    return()=>{surface.removeEventListener('touchstart',prevent);surface.removeEventListener('touchmove',prevent);surface.removeEventListener('contextmenu',prevent);surface.removeEventListener('selectstart',prevent);};
  },[kind]);
  const signed=score=>practice?score.toLocaleString():score===0?'0':(side==='oppose'?'-':'+')+score;
  const paint=()=>{const ctx=canvas.current?.getContext('2d');if(ctx&&game.current)draw(ctx,game.current,playerIcon.current,post.coin);};
  const install=progress=>{game.current=structuredClone(progress.game);random.current=battleRandom(progress.randomState);banked.current=progress.bankedScore;revision.current=progress.revision;inputs.current=[];ticks.current=0;packets.current=[];pendingAction.current=false;drag.current.reset();heldKeys.current.clear();setDisplay({score:banked.current+game.current.score,time:game.current.time});};
  const startPractice=()=>{
    const seed=crypto.getRandomValues(new Uint32Array(1))[0];
    install(newBattleProgress(practiceKind,seed));setSession({kind:practiceKind});setResult(null);setError('');setMode('ready');
  };
  useEffect(()=>{if(practice)startPractice();},[practiceKind]);
  const sharePractice=()=>{
    try{onShare({image:capturePracticeResult(canvas.current,{title:t(gameLabels[kind][0]),score:display.score,coin:post.coin}),coin:post.coin,content:t('{0} 연습에서 {1}점을 얻었어요!',t(gameLabels[kind][0]),display.score)});}
    catch{setError('결과 이미지를 만들지 못했습니다. 다시 시도해 주세요.');}
  };
  const start=async selected=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError('');
    if(!request.current||request.current.side!==selected)request.current={side:selected,id:crypto.randomUUID()};
    try{const value=await data.startBattle(post.id,selected,request.current.id);if(!value.progress)throw Error('새 배틀 서버를 연결한 후 다시 시도해 주세요.');sessionRef.current=value;install(value.progress);setSession(value);setResult(null);setMode('ready');}
    catch(e){setError(e.message||'배틀을 시작하지 못했습니다.');}finally{locked.current=false;setBusy(false);}
  };
  const enqueue=()=>{if(practice){inputs.current=[];ticks.current=0;return;}if(ticks.current){packets.current.push({inputs:inputs.current,ticks:ticks.current});inputs.current=[];ticks.current=0;}};
  const sync=()=>{
    if(practice)return Promise.resolve(true);
    if(pumping.current)return pumping.current;
    if(!packets.current.length)return Promise.resolve(true);
    setSyncing(true);
    pumping.current=(async()=>{
      try{while(packets.current.length){const packet=packets.current[0];const saved=await data.checkpointBattle(sessionRef.current.id,revision.current,packet.inputs,packet.ticks);revision.current=saved.revision;packets.current.shift();}return true;}
      catch(e){if(mounted.current){setError(e.message||'게임 기록을 전송하지 못했습니다.');setMode('sync-error');}return false;}
      finally{pumping.current=null;if(mounted.current)setSyncing(false);}
    })();return pumping.current;
  };
  const finishAction=async apply=>{
    if(locked.current||result)return;locked.current=true;setBusy(true);setError('');enqueue();
    try{if(!await sync())return;
      if(apply){
        setApplying(true);
        const applied=await data.applyBattle(session.id);setResult(applied);setApplying(false);
        await notify('반영 완료했습니다.',{kind:'success',title:'점수 반영 완료'});
        onClose();
      } else {
        const progress=await data.continueBattle(session.id,revision.current);
        install(progress);setSession(current=>({...current,kind:progress.game.kind}));
        pendingAction.current=['flappy','runner'].includes(progress.game.kind);setMode('playing');
      }
    }catch(e){setError(e.message||'요청을 처리하지 못했습니다.');}finally{setApplying(false);locked.current=false;setBusy(false);}
  };
  useEffect(()=>{if(mode==='ready')paint();},[mode,session]);
  useEffect(()=>{
    if(mode!=='playing'){drag.current.reset();heldKeys.current.clear();return;}
    let frame,previous=null,accumulator=0,displayedAt=-1;
    const tick=time=>{
      if(previous!==null)accumulator+=Math.min((time-previous)/1000,.05);previous=time;
      while(accumulator>=TICK&&!game.current.ended){if(game.current.kind==='bounce'){
        const [dx,dy]=drag.current.take(),keys=heldKeys.current;
        const keyX=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')),keyY=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));
        const length=Math.hypot(keyX,keyY)||1,keyboardStep=210*TICK*MOVE_SCALE;
        const x=Math.max(-WIDTH*MOVE_SCALE,Math.min(WIDTH*MOVE_SCALE,dx+Math.round(keyX/length*keyboardStep)));
        const y=Math.max(-HEIGHT*MOVE_SCALE,Math.min(HEIGHT*MOVE_SCALE,dy+Math.round(keyY/length*keyboardStep)));
        if(x||y){if(!practice)inputs.current.push([ticks.current,x,y]);moveBouncePlayer(game.current,x/MOVE_SCALE,y/MOVE_SCALE);}
      }else if(pendingAction.current){if(!practice)inputs.current.push(ticks.current);jump(game.current);pendingAction.current=false;}step(game.current,TICK,random.current);ticks.current++;accumulator-=TICK;if(ticks.current===CHECKPOINT_TICKS){enqueue();void sync();}}
      paint();if(game.current.time-displayedAt>=.1||game.current.ended){setDisplay({score:banked.current+game.current.score,time:game.current.time});displayedAt=game.current.time;}
      if(game.current.ended){enqueue();void sync();setMode('ended');return;}frame=requestAnimationFrame(tick);
    };frame=requestAnimationFrame(tick);
    const pause=()=>{if(document.hidden)setMode('paused');};const blur=()=>{drag.current.reset();heldKeys.current.clear();setMode('paused');};document.addEventListener('visibilitychange',pause);window.addEventListener('blur',blur);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',pause);window.removeEventListener('blur',blur);};
  },[mode]);
  const act=()=>{if(!['ready','playing'].includes(mode)||game.current?.ended)return;if(mode==='ready'){setMode('playing');pendingAction.current=['flappy','runner'].includes(kind);}else pendingAction.current=true;canvas.current?.focus();};
  const retrySync=async()=>{setError('');enqueue();if(await sync())setMode(game.current.ended?'ended':'paused');};
  const close=async()=>{if(practice){onClose();return;}if(locked.current)return;if(session&&game.current?.ended&&!result){await finishAction(true);return;}if(session&&!result){if(mode==='playing')setMode('paused');if(!(await confirm('배틀을 종료할까요? 적용하지 않은 점수는 피드에 반영되지 않습니다.',{title:'배틀 종료',confirmLabel:'종료'})))return;}onClose();};
  return <Modal title={t("배틀")} onClose={close} className="battle-games-modal">
    <p className="battle-post-context">{practice?t('배틀 연습'): <>{author?.username||post.author}{t("님의 피드 ·")}</>}{' '}{post.coin}</p>
    {mode==='choose'?(practice?<p>{t('배틀 준비 중…')}</p>:<section className="battle-choice"><h2>{t("이 피드에 대한 입장을 선택하세요")}</h2><p>{t("게임에서 얻은 점수를 원하는 방향으로 반영하세요.")}</p><div className="side-choice"><button disabled={busy} onClick={()=>start('support')}>{t("지지하기")}<small>{t("지지 점수에 더하기")}</small></button><button disabled={busy} onClick={()=>start('oppose')}>{t("반대하기")}<small>{t("지지 점수에서 빼기")}</small></button></div>{busy&&<p role="status">{t("배틀 준비 중…")}</p>}</section>):<>
      <div className="battle-game-heading"><div><small>{practice?t('연습 점수는 피드에 반영되지 않습니다.'):<>{side==='support'?t("지지"):t("반대")}{t("· 점수는 적용 전까지 보관됩니다")}</>}</small><h2>{t(gameLabels[kind]?.[0])}</h2></div></div>
      <div className={'arcade-score '+side}><b>{signed(display.score)}{t("점")}</b><span>{display.time.toFixed(1)}{t("초")}</span>{mode==='playing'&&<button onClick={()=>setMode('paused')} aria-label={t("게임 일시정지")}><Pause/></button>}</div>
      <div className="arcade-board"><canvas ref={canvas} width={WIDTH} height={HEIGHT} tabIndex={0} aria-label={(t(gameLabels[kind]?.[0])||t("배틀"))+t(" 게임 화면")} aria-describedby="arcade-instructions" onPointerDown={e=>{
          if(!e.isPrimary || e.button!==0)return;
          e.preventDefault();
          if(kind==='bounce'){
            if(!['ready','playing'].includes(mode))return;
            canvas.current?.focus();if(mode==='ready')act();
            if(drag.current.begin(e.pointerId,e.clientX,e.clientY))e.currentTarget.setPointerCapture(e.pointerId);
          }else act();
        }} onPointerMove={e=>{
          if(kind!=='bounce'||mode!=='playing')return;
          e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();
          drag.current.move(e.pointerId,e.clientX,e.clientY,WIDTH/rect.width,HEIGHT/rect.height);
        }} onPointerUp={e=>{drag.current.end(e.pointerId);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
        onPointerCancel={()=>drag.current.reset()} onLostPointerCapture={e=>drag.current.end(e.pointerId)} onBlur={()=>{heldKeys.current.clear();drag.current.reset();}}
        onKeyDown={e=>{
          if(kind==='bounce'&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
            e.preventDefault();if(mode==='ready')act();if(['ready','playing'].includes(mode))heldKeys.current.add(e.key);
          }else if([' ','ArrowUp'].includes(e.key)){e.preventDefault();if(!e.repeat)act();}
        }} onKeyUp={e=>{if(kind==='bounce'&&e.key.startsWith('Arrow'))e.preventDefault();heldKeys.current.delete(e.key);}}/>
        {mode!=='playing'&&<div className="arcade-overlay">{mode==='ended'?(practice?<><Trophy/><h3>{t('연습 완료')}</h3><strong>{signed(display.score)}{t('점')}</strong><p>{t('연습 점수는 피드에 반영되지 않습니다.')}</p><button className="primary" onClick={sharePractice}>{t('결과 피드로 공유')}</button><div className="battle-end-actions"><button className="secondary" onClick={startPractice}>{t('다시 연습')}</button><button className="secondary" onClick={onClose}>{t('나가기')}</button></div></>:<><Trophy/><h3>{t("게임 종료")}</h3><strong className={side==='oppose'?'negative':''}>{signed(result?.score??display.score)}{t("점")}</strong><p role="status">{result?t('반영 완료했습니다.'):applying?t('최종 점수를 피드에 반영하겠습니다.'):syncing?t('게임 기록 확인 중…'):t('게임계속은 점수를 누적하고, 나가기는 최종 점수를 반영합니다.')}</p><div className="battle-end-actions"><button className="primary" disabled={busy||syncing||!!result} onClick={()=>finishAction(false)}>{t('게임계속')}</button><button className="primary" disabled={busy||syncing} onClick={()=>result?onClose():finishAction(true)}>{t('나가기')}</button></div></>):mode==='sync-error'?<><h3>{t("게임 기록을 보관하고 있어요")}</h3><p>{t("연결을 확인한 뒤 이어서 진행하세요.")}</p><button className="primary" disabled={syncing} onClick={retrySync}>{t("연결 다시 시도")}</button></>:mode==='paused'?<><h3>{t("잠시 쉬어가세요")}</h3><button className="primary" onClick={()=>{setMode('playing');canvas.current?.focus();}}><Play/>{t("계속하기")}</button></>:<><h3>{banked.current?t("점수를 유지하고 계속 도전하세요"):t(gameLabels[kind]?.[1])}</h3><p>{t("시간 제한 없이 도전하세요")}</p><button className="primary" onClick={act}><Play/>{banked.current?t("이어 시작"):t("게임 시작")}</button></>}</div>}
      </div><p id="arcade-instructions" className="arcade-instructions">{kind==='bounce'?t('화면 어디서든 드래그 · 방향키로 이동'):t("화면 터치 · Space · ↑ 키로 ")+t(gameLabels[kind]?.[2])}</p>
      {mode==='playing'&&kind!=='bounce'&&<button className="primary arcade-control" onClick={act}>{t(gameLabels[kind]?.[2])}</button>}
    </>}{error&&<p className="error" role="alert">{t(error)}</p>}<p className="form-help arcade-note">{practice?t("원하는 게임을 연습하고 결과를 공유해 보세요."):t("무료 배틀 · 게임계속은 점수 누적 · 나가기를 눌러 피드에 반영")}</p>
  </Modal>;
}
