import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Trophy } from 'lucide-react';
import { Modal } from './ui.jsx';
import { chooseGame, newGame, jump, step, WIDTH, HEIGHT, GROUND } from './battle-engine.js';

function randomGame() { return chooseGame(crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296); }
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
  const [kind, setKind] = useState(randomGame), [mode, setMode] = useState('ready'), [display, setDisplay] = useState({ score: 0, time: 0 });
  const canvas = useRef(null), game = useRef(newGame(kind));
  const paint = () => { const context = canvas.current?.getContext('2d'); if (context) draw(context, game.current); };
  useEffect(() => { game.current = newGame(kind); setDisplay({ score: 0, time: 0 }); paint(); }, [kind]);
  useEffect(() => {
    if (mode !== 'playing') return;
    let frame, previous = null, accumulator = 0, displayedAt = -1;
    const tick = time => {
      if (previous !== null) accumulator += Math.min((time - previous) / 1000, .05);
      previous = time;
      while (accumulator >= 1 / 120 && !game.current.ended) { step(game.current, 1 / 120); accumulator -= 1 / 120; }
      paint();
      if (game.current.time - displayedAt >= .1 || game.current.ended) { setDisplay({ score: game.current.score, time: game.current.time }); displayedAt = game.current.time; }
      if (game.current.ended) { setMode('ended'); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const pause = () => { if (document.hidden) setMode('paused'); };
    document.addEventListener('visibilitychange', pause);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', pause); };
  }, [mode, kind]);
  const act = () => {
    if (mode === 'ended' || mode === 'paused') return;
    if (mode === 'ready') setMode('playing');
    jump(game.current); canvas.current?.focus();
  };
  const retry = () => { const next = randomGame(); game.current = newGame(next); setKind(next); setDisplay({ score: 0, time: 0 }); setMode('ready'); requestAnimationFrame(paint); };
  return <Modal title="배틀" onClose={onClose} className="battle-games-modal"><div className="battle-game-heading"><div><small>랜덤 미니게임</small><h2>{kind === 'flappy' ? '플래피 버드' : '공룡 달리기'}</h2></div><span>{kind === 'flappy' ? 'FLAPPY BIRD' : 'DINO RUN'}</span></div>
    <p className="battle-post-context">{post.author}님의 피드 · {post.coin}</p>
    <div className="arcade-score"><b>{display.score}점</b><span>{Math.max(0, 60 - display.time).toFixed(1)}초</span>{mode === 'playing' && <button onClick={() => setMode('paused')} aria-label="게임 일시정지"><Pause/></button>}</div>
    <div className="arcade-board"><canvas ref={canvas} width={WIDTH} height={HEIGHT} tabIndex={0} aria-label={kind === 'flappy' ? '플래피 버드 게임 화면' : '공룡 달리기 게임 화면'} aria-describedby="arcade-instructions" onPointerDown={event => { event.preventDefault(); act(); }} onKeyDown={event => { if ([' ', 'ArrowUp'].includes(event.key)) { event.preventDefault(); if (!event.repeat) act(); } }}/>
      {mode !== 'playing' && <div className="arcade-overlay">{mode === 'ended' ? <><Trophy/><h3>{game.current.reason === 'complete' ? '완주했어요!' : '게임 종료'}</h3><strong>{display.score}점</strong><button className="primary" onClick={retry}><RotateCcw/>다시 랜덤 배틀</button></> : mode === 'paused' ? <><h3>잠시 쉬어가세요</h3><button className="primary" onClick={() => { setMode('playing'); canvas.current?.focus(); }}><Play/>계속하기</button></> : <><h3>{kind === 'flappy' ? '파이프 사이로 날아보세요' : '선인장을 뛰어넘으세요'}</h3><p>최대 60초 동안 도전하세요</p><button className="primary" onClick={act}><Play/>게임 시작</button></>}</div>}
    </div><p id="arcade-instructions" className="arcade-instructions">{kind === 'flappy' ? '화면 터치 · Space · ↑ 키로 날갯짓' : '화면 터치 · Space · ↑ 키로 점프'}</p>
    {mode === 'playing' && <button className="primary arcade-control" onClick={act}>{kind === 'flappy' ? '날갯짓' : '점프'}</button>}
    <p className="form-help arcade-note">무료 연습 배틀 · 게임 점수는 BP와 피드 순위에 반영되지 않습니다.</p>
  </Modal>;
}
