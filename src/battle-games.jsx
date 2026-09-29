import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Trophy } from 'lucide-react';
import { Modal } from './ui.jsx';
import { newGame, jump, step, WIDTH, HEIGHT, GROUND } from './battle-engine.js';

import { TICK } from '../functions/battle-validation.js';
import { battleRandom, CHECKPOINT_TICKS } from '../functions/battle-progress.js';
import { useLiveProfile } from './live-profile.js';
import { data } from './data.js';
import { useFeedback } from './feedback.jsx';
function draw(context, game) {
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
    context.save(); context.translate(87, game.y); context.rotate(Math.max(-.4, Math.min(.6, game.velocity / 650)));
    context.fillStyle = '#7157ff'; context.beginPath(); context.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#baf7d0'; context.beginPath(); context.ellipse(-6, 3, 8, 5, Math.sin(game.time * 14) * .4, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#fff'; context.beginPath(); context.arc(7, -4, 5, 0, Math.PI * 2); context.fill(); context.fillStyle = '#27223f'; context.fillRect(8, -6, 3, 4);
    context.fillStyle = '#ffbe69'; context.beginPath(); context.moveTo(12, 1); context.lineTo(22, 4); context.lineTo(12, 7); context.fill(); context.restore();
  } else {
    const x = 61, y = game.y; context.fillStyle = '#27223f';
    context.fillRect(x + 11, y, 23, 15); context.fillRect(x + 4, y + 10, 20, 17); context.fillRect(x - 3, y + 13, 9, 8);
    context.fillRect(x + 21, y + 18, 9, 4); context.fillStyle = '#fff'; context.fillRect(x + 26, y + 3, 3, 3);
    context.fillStyle = '#27223f'; const stride = game.velocity === 0 ? Math.sin(game.time * 20) * 3 : 0;
    context.fillRect(x + 5, y + 25, 6, 9 + stride); context.fillRect(x + 17, y + 25, 6, 9 - stride);
  }
}

export function BattleGames({ post, onClose }) {
  const { confirm } = useFeedback(), author=useLiveProfile(post.authorId);
  const [session,setSession]=useState(null),[mode,setMode]=useState('choose'),[display,setDisplay]=useState({score:0,time:0});
  const [busy,setBusy]=useState(false),[syncing,setSyncing]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
  const canvas=useRef(null),game=useRef(null),random=useRef(null),inputs=useRef([]),ticks=useRef(0),banked=useRef(0),revision=useRef(0),packets=useRef([]),pumping=useRef(null),locked=useRef(false),request=useRef(null),sessionRef=useRef(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const side=session?.side,kind=session?.kind;
  const signed=score=>score===0?'0':(side==='oppose'?'-':'+')+score;
  const paint=()=>{const ctx=canvas.current?.getContext('2d');if(ctx&&game.current)draw(ctx,game.current);};
  const install=progress=>{game.current=structuredClone(progress.game);random.current=battleRandom(progress.randomState);banked.current=progress.bankedScore;revision.current=progress.revision;inputs.current=[];ticks.current=0;packets.current=[];setDisplay({score:banked.current+game.current.score,time:game.current.time});};
  const start=async selected=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError('');
    if(!request.current||request.current.side!==selected)request.current={side:selected,id:crypto.randomUUID()};
    try{const value=await data.startBattle(post.id,selected,request.current.id);if(!value.progress)throw Error('새 배틀 서버를 연결한 후 다시 시도해 주세요.');sessionRef.current=value;install(value.progress);setSession(value);setResult(null);setMode('ready');}
    catch(e){setError(e.message||'배틀을 시작하지 못했습니다.');}finally{locked.current=false;setBusy(false);}
  };
  const enqueue=()=>{if(ticks.current){packets.current.push({inputs:inputs.current,ticks:ticks.current});inputs.current=[];ticks.current=0;}};
  const sync=()=>{
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
      if(apply)setResult(await data.applyBattle(session.id));
      else{const progress=await data.continueBattle(session.id,revision.current);install(progress);setMode('ready');}
    }catch(e){setError(e.message||'요청을 처리하지 못했습니다.');}finally{locked.current=false;setBusy(false);}
  };
  useEffect(()=>{if(mode==='ready')paint();},[mode,session]);
  useEffect(()=>{
    if(mode!=='playing')return;
    let frame,previous=null,accumulator=0,displayedAt=-1;
    const tick=time=>{
      if(previous!==null)accumulator+=Math.min((time-previous)/1000,.05);previous=time;
      while(accumulator>=TICK&&!game.current.ended){step(game.current,TICK,random.current);ticks.current++;accumulator-=TICK;if(ticks.current===CHECKPOINT_TICKS){enqueue();void sync();}}
      paint();if(game.current.time-displayedAt>=.1||game.current.ended){setDisplay({score:banked.current+game.current.score,time:game.current.time});displayedAt=game.current.time;}
      if(game.current.ended){enqueue();void sync();setMode('ended');return;}frame=requestAnimationFrame(tick);
    };frame=requestAnimationFrame(tick);
    const pause=()=>{if(document.hidden)setMode('paused');};document.addEventListener('visibilitychange',pause);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',pause);};
  },[mode]);
  const act=()=>{if(!['ready','playing'].includes(mode)||game.current?.ended)return;if(mode==='ready')setMode('playing');if(inputs.current.at(-1)!==ticks.current){inputs.current.push(ticks.current);jump(game.current);}canvas.current?.focus();};
  const retrySync=async()=>{setError('');enqueue();if(await sync())setMode(game.current.ended?'ended':'paused');};
  const close=async()=>{if(locked.current)return;if(session&&!result){if(mode==='playing')setMode('paused');if(!(await confirm('배틀을 종료할까요? 적용하지 않은 점수는 피드에 반영되지 않습니다.',{title:'배틀 종료',confirmLabel:'종료'})))return;}onClose();};
  const retry=()=>{request.current=null;setSession(null);setResult(null);setError('');setMode('choose');};
  return <Modal title="배틀" onClose={close} className="battle-games-modal">
    <p className="battle-post-context">{author?.username||post.author}님의 피드 · {post.coin}</p>
    {mode==='choose'?<section className="battle-choice"><h2>이 피드에 대한 입장을 선택하세요</h2><p>게임에서 얻은 점수를 원하는 방향으로 반영하세요.</p><div className="side-choice"><button disabled={busy} onClick={()=>start('support')}>지지하기<small>지지 점수에 더하기</small></button><button disabled={busy} onClick={()=>start('oppose')}>반대하기<small>지지 점수에서 빼기</small></button></div>{busy&&<p role="status">배틀 준비 중…</p>}</section>:<>
      <div className="battle-game-heading"><div><small>{side==='support'?'지지':'반대'} · 점수는 적용 전까지 보관됩니다</small><h2>{kind==='flappy'?'플래피 버드':'공룡 달리기'}</h2></div></div>
      <div className={'arcade-score '+side}><b>{signed(display.score)}점</b><span>{display.time.toFixed(1)}초</span>{mode==='playing'&&<button onClick={()=>setMode('paused')} aria-label="게임 일시정지"><Pause/></button>}</div>
      <div className="arcade-board"><canvas ref={canvas} width={WIDTH} height={HEIGHT} tabIndex={0} aria-label={kind==='flappy'?'플래피 버드 게임 화면':'공룡 달리기 게임 화면'} aria-describedby="arcade-instructions" onPointerDown={e=>{e.preventDefault();act();}} onKeyDown={e=>{if([' ','ArrowUp'].includes(e.key)){e.preventDefault();if(!e.repeat)act();}}}/>
        {mode!=='playing'&&<div className="arcade-overlay">{mode==='ended'?<><Trophy/><h3>게임 종료</h3><strong className={side==='oppose'?'negative':''}>{signed(result?.score??display.score)}점</strong><p role="status">{result?'피드 지지점수에 반영했습니다.':syncing?'게임 기록 확인 중…':'이 점수를 선택한 피드 지지점수에 반영할까요?'}</p>{!result?<div className="battle-end-actions"><button className="primary" disabled={busy||syncing} onClick={()=>finishAction(true)}>점수적용</button><button className="secondary" disabled={busy||syncing} onClick={()=>finishAction(false)}>게임계속</button></div>:<button className="primary" onClick={retry}><RotateCcw/>새 배틀</button>}</>:mode==='sync-error'?<><h3>게임 기록을 보관하고 있어요</h3><p>연결을 확인한 뒤 이어서 진행하세요.</p><button className="primary" disabled={syncing} onClick={retrySync}>연결 다시 시도</button></>:mode==='paused'?<><h3>잠시 쉬어가세요</h3><button className="primary" onClick={()=>{setMode('playing');canvas.current?.focus();}}><Play/>계속하기</button></>:<><h3>{banked.current?'점수를 유지하고 계속 도전하세요':kind==='flappy'?'파이프 사이로 날아보세요':'선인장을 뛰어넘으세요'}</h3><p>시간 제한 없이 도전하세요</p><button className="primary" onClick={act}><Play/>{banked.current?'이어 시작':'게임 시작'}</button></>}</div>}
      </div><p id="arcade-instructions" className="arcade-instructions">{kind==='flappy'?'화면 터치 · Space · ↑ 키로 날갯짓':'화면 터치 · Space · ↑ 키로 점프'}</p>
      {mode==='playing'&&<button className="primary arcade-control" onClick={act}>{kind==='flappy'?'날갯짓':'점프'}</button>}
    </>}{error&&<p className="error" role="alert">{error}</p>}<p className="form-help arcade-note">무료 배틀 · 게임계속은 점수 유지 · 점수적용을 눌러 피드에 반영</p>
  </Modal>;
}
