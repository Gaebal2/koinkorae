import {t} from './language.js';
export function capturePracticeResult(canvas,{title,score,coin}) {
  const image=document.createElement('canvas');image.width=960;image.height=600;
  const ctx=image.getContext('2d');
  ctx.fillStyle='#f5f2ff';ctx.fillRect(0,0,960,600);
  ctx.textAlign='left';ctx.fillStyle='#7157ff';ctx.font='bold 24px sans-serif';ctx.fillText(t('배틀 연습'),60,115);
  ctx.fillStyle='#25194d';ctx.font='bold 38px sans-serif';ctx.fillText(title,60,182,440);
  ctx.drawImage(canvas,570,70,300,367);
  ctx.fillStyle='#7157ff';ctx.font='bold 72px sans-serif';ctx.fillText(`${score.toLocaleString()} ${t('점')}`,60,292,450);
  ctx.fillStyle='#6d6480';ctx.font='24px sans-serif';ctx.fillText(`${coin} · ${t('연습 기록')}`,60,348,440);
  ctx.font='20px sans-serif';ctx.fillText(t('연습 점수는 피드에 반영되지 않습니다.'),60,483,800);
  ctx.fillStyle='#25194d';ctx.font='bold 24px sans-serif';ctx.fillText('ㅋㅇㄱㄹ',60,534);
  let result=image.toDataURL('image/jpeg',.85);
  if(result.length>300000)result=image.toDataURL('image/jpeg',.6);
  if(result.length>300000)throw Error('Image too large');
  return result;
}
