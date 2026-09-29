export const WIDTH = 360, HEIGHT = 440, GROUND = 396;
export const GAME_KINDS = ['flappy','runner','stack','tower','dodge'];
export const chooseGame = value => GAME_KINDS[Math.min(4,Math.max(0,Math.floor(value*5)))];
export function newGame(kind) {
  if(kind==='stack')return {kind,time:0,score:0,ended:false,reason:'',baseX:90,width:180,x:0,direction:1,blocks:[]};
  if(kind==='tower')return {kind,time:0,score:0,ended:false,reason:'',x:180,phase:0,flight:0,airborne:false};
  if(kind==='dodge')return {kind,time:0,score:0,ended:false,reason:'',lane:0,obstacles:[],nextObstacle:1};
  return { kind, time: 0, score: 0, y: kind === 'flappy' ? 190 : GROUND - 34, velocity: 0, obstacles: [], nextObstacle: kind === 'flappy' ? 1.3 : 1.4, ended: false, reason: '' };
}
export function jump(game) {
  if (game.ended) return;
  if(game.kind==='stack') {
    const left=Math.max(game.x,game.baseX),right=Math.min(game.x+game.width,game.baseX+game.width);
    if(right-left<8){game.ended=true;game.reason='collision';return;}
    game.width=right-left;game.baseX=left;game.score+=1;game.blocks.push({x:left,w:game.width});game.blocks=game.blocks.slice(-10);game.x=game.direction>0?WIDTH-game.width:0;game.direction*=-1;return;
  }
  if(game.kind==='tower'){if(!game.airborne){game.airborne=true;game.flight=0;}return;}
  if(game.kind==='dodge'){game.lane=1-game.lane;return;}
  if (game.kind === 'flappy') game.velocity = -295;
  else if (game.y >= GROUND - 34 - 0.1) game.velocity = -540;
}
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export function step(game, dt, random = Math.random) {
  if (game.ended) return game;
  game.time += dt;
  if(game.kind==='stack') {
    game.x+=game.direction*(95+Math.min(game.score,18)*5)*dt;
    if(game.x<0){game.x=-game.x;game.direction=1;}if(game.x>WIDTH-game.width){game.x=2*(WIDTH-game.width)-game.x;game.direction=-1;}
    return game;
  }
  if(game.kind==='tower') {
    game.x=180+Math.sin(game.time*(1.5+Math.min(game.score,20)/20)+game.phase)*112;
    if(game.airborne){game.flight+=dt;if(game.flight>=.8){game.airborne=false;if(Math.abs(game.x-180)>49){game.ended=true;game.reason='collision';}else{game.score+=1;game.phase=random()*Math.PI*2;}}}
    return game;
  }
  if(game.kind==='dodge') {
    if(game.time>=game.nextObstacle){game.obstacles.push({lane:random()<.5?0:1,y:-30,passed:false});game.nextObstacle=game.time+Math.max(.8,1.15-game.time*.004);}
    for(const obstacle of game.obstacles){obstacle.y+=(220+Math.min(120,game.time*2))*dt;if(obstacle.lane===game.lane&&obstacle.y+30>330&&obstacle.y<358){game.ended=true;game.reason='collision';}if(!obstacle.passed&&obstacle.y>358){obstacle.passed=true;game.score+=1;}}
    game.obstacles=game.obstacles.filter(o=>o.y<HEIGHT+30);return game;
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
