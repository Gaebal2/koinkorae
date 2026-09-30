import {newBounceGame,stepBounce} from './bounce-game.js';
export {ARENA,MOVE_SCALE,moveBouncePlayer} from './bounce-game.js';
export const WIDTH = 360, HEIGHT = 440, GROUND = 396;
export const GAME_KINDS = ['flappy','runner','tower','bounce'];
export const chooseGame = (value,kinds=GAME_KINDS) => kinds[Math.min(kinds.length-1,Math.max(0,Math.floor(value*kinds.length)))];
export function newGame(kind) {
  if(!GAME_KINDS.includes(kind))throw Error('지원하지 않는 게임입니다. 새 배틀을 시작해 주세요.');
  if(kind==='bounce')return newBounceGame();
  if(kind==='tower')return {kind,time:0,score:0,ended:false,reason:'',x:180,phase:0,flight:0,airborne:false,cameraY:0,platforms:[{x:180,y:365}]};
  return { kind, time: 0, score: 0, y: kind === 'flappy' ? 190 : GROUND - 34, velocity: 0, obstacles: [], nextObstacle: kind === 'flappy' ? 1.3 : 1.4, ended: false, reason: '' };
}
export function jump(game) {
  if (game.ended || game.kind==='bounce') return;

  if(game.kind==='tower'){if(!game.airborne){game.airborne=true;game.flight=0;}return;}
  if (game.kind === 'flappy') game.velocity = -295;
  else if (game.y >= GROUND - 34 - 0.1) game.velocity = -540;
}
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export function step(game, dt, random = Math.random) {
  if (game.ended) return game;
  if(game.kind==='bounce')return stepBounce(game,dt,random);
  game.time += dt;

  if(game.kind==='tower') {
    game.x=180+Math.sin(game.time*(1.5+Math.min(game.score,20)/20)+game.phase)*112;
    if(game.airborne){game.flight+=dt;if(game.flight>=.8){game.airborne=false;if(Math.abs(game.x-180)>49){game.ended=true;game.reason='collision';}else{game.score+=1;game.platforms ??= [{x:180,y:365}];game.platforms.push({x:game.x,y:365-game.score*120});game.platforms=game.platforms.slice(-6);game.phase=random()*Math.PI*2;}}}
    game.cameraY ??= Math.max(0,(game.score-1)*120);
    game.cameraY += (game.score*120-game.cameraY)*Math.min(1,dt*6);
    return game;
  }

  const bird = game.kind === 'flappy';
  game.velocity += (bird ? 900 : 1600) * dt;
  game.y += game.velocity * dt;
  if (!bird && game.y >= GROUND - 34) { game.y = GROUND - 34; game.velocity = 0; }
  const speed = bird ? 142 : Math.min(365, 220 + game.time * 3);
  if (game.time >= game.nextObstacle) {
    game.obstacles.push(bird ? { x: WIDTH + 10, gap: 125 + random() * 125, w: 50, passed: false } : { x: WIDTH + 10, w: 22 + Math.floor(random() * 13), h: 28 + Math.floor(random() * 23) });
    game.nextObstacle = game.time + (bird ? 1.7 : 1.2 + random() * 0.55);
  }
  const player = bird ? { x: 76, y: game.y - 10, w: 21, h: 20 } : { x: 63, y: game.y + 3, w: 23, h: 29 };
  let collision = bird && (game.y < 12 || game.y > GROUND - 12);
  for (const obstacle of game.obstacles) {
    obstacle.x -= speed * dt;
    if (bird) {
      collision ||= overlap(player, { x: obstacle.x, y: 0, w: obstacle.w, h: obstacle.gap - 76 }) || overlap(player, { x: obstacle.x, y: obstacle.gap + 76, w: obstacle.w, h: GROUND - obstacle.gap - 76 });
      if (!obstacle.passed && obstacle.x + obstacle.w < player.x) { obstacle.passed = true; game.score++; }
    } else {
      collision ||= overlap(player, { x: obstacle.x + 3, y: GROUND - obstacle.h + 3, w: obstacle.w - 6, h: obstacle.h - 3 });
      if (!obstacle.passed && obstacle.x + obstacle.w < player.x) { obstacle.passed = true; game.score++; }
    }
  }
  game.obstacles = game.obstacles.filter(o => o.x + o.w > -10);
  if (collision) { game.ended = true; game.reason = 'collision'; }
  return game;
}
