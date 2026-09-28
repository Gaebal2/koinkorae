export const WIDTH = 360, HEIGHT = 440, GROUND = 396;
export const chooseGame = value => value < 0.5 ? 'flappy' : 'runner';
export function newGame(kind) {
  return { kind, time: 0, score: 0, y: kind === 'flappy' ? 190 : GROUND - 34, velocity: 0, obstacles: [], nextObstacle: kind === 'flappy' ? 1.3 : 1.4, ended: false, reason: '' };
}
export function jump(game) {
  if (game.ended) return;
  if (game.kind === 'flappy') game.velocity = -295;
  else if (game.y >= GROUND - 34 - 0.1) game.velocity = -540;
}
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export function step(game, dt, random = Math.random) {
  if (game.ended) return game;
  game.time += dt;
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
    } else collision ||= overlap(player, { x: obstacle.x + 3, y: GROUND - obstacle.h + 3, w: obstacle.w - 6, h: obstacle.h - 3 });
  }
  game.obstacles = game.obstacles.filter(o => o.x + o.w > -10);
  if (!bird) game.score = Math.floor(game.time * 10);
  if (collision || game.time >= 60) { game.ended = true; game.reason = collision ? 'collision' : 'complete'; }
  return game;
}
