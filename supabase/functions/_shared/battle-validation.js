import { newGame, jump, step } from './battle-engine.js';
export const TICK = 1 / 120;
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function replayBattle(kind, seed, inputs, elapsedMs) {
  if (!['flappy', 'runner'].includes(kind) || !Array.isArray(inputs) || inputs.length > 7201 || inputs.some((tick, index) => !Number.isInteger(tick) || tick < 0 || tick > 7200 || (index > 0 && tick <= inputs[index - 1]))) throw Error('잘못된 게임 기록입니다.');
  const game = newGame(kind), random = seededRandom(seed);
  let tick = 0, index = 0;
  while (!game.ended && tick <= 7200) {
    if (inputs[index] === tick) { jump(game); index++; }
    step(game, TICK, random); tick++;
  }
  if (index !== inputs.length || !game.ended || game.time * 1000 > elapsedMs + 250) throw Error('게임 시간과 기록이 일치하지 않습니다.');
  return { score: game.score, duration: game.time, reason: game.reason };
}
export function scoreResult(side, score) {
  if (!['support', 'oppose'].includes(side) || !Number.isInteger(score) || score < 0) throw Error('잘못된 배틀 점수입니다.');
  return { score, side, delta: side === 'support' ? score : -score };
}
