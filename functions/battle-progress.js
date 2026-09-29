import {newGame,jump,step} from './battle-engine.js';
import {TICK} from './battle-validation.js';
// Only individual verification packets are bounded; the game itself has no time limit.
export const CHECKPOINT_TICKS=1200;
export function battleRandom(seed) {
  let state=seed>>>0;
  const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  next.state=()=>state;return next;
}
export function newBattleProgress(kind,seed) {
  return {game:newGame(kind),randomState:seed>>>0,totalTicks:0,bankedScore:0,round:0,revision:0,lastOp:'start'};
}
export function advanceBattle(progress,inputs,ticks,elapsedMs) {
  if (!Number.isInteger(ticks)||ticks<1||ticks>CHECKPOINT_TICKS||!Array.isArray(inputs)||inputs.length>ticks||inputs.some((tick,i)=>!Number.isInteger(tick)||tick<0||tick>=ticks||(i>0&&tick<=inputs[i-1]))) throw Error('잘못된 게임 기록입니다.');
  if ((progress.totalTicks+ticks)*TICK*1000>elapsedMs+250) throw Error('게임 시간과 기록이 일치하지 않습니다.');
  const game=JSON.parse(JSON.stringify(progress.game)),random=battleRandom(progress.randomState);
  let index=0;
  for(let tick=0;tick<ticks;tick++) {
    if(game.ended)throw Error('종료 후 게임 기록은 사용할 수 없습니다.');
    if(inputs[index]===tick){jump(game);index++;}
    step(game,TICK,random);
  }
  return {...progress,game,randomState:random.state(),totalTicks:progress.totalTicks+ticks,revision:progress.revision+1,lastOp:'checkpoint'};
}
export function continueBattleProgress(progress) {
  if(!progress.game.ended)throw Error('아직 종료되지 않은 게임입니다.');
  return {...progress,game:newGame(progress.game.kind),bankedScore:progress.bankedScore+progress.game.score,round:progress.round+1,revision:progress.revision+1,lastOp:'continue'};
}
