import { ARENA } from './battle-engine.js';
import { t } from './language.js';
export const gameLabels={rain:['비 피하기','빗줄기를 피하세요 · 생존 3초당 1점','좌우 드래그'],traffic:['8차선 장애물 피하기','자동차와 오토바이를 피하세요 · 생존 3초당 1점','좌우 드래그'],breakout:['벽돌깨기','바로 공을 튕기세요 · 벽돌 1개당 1점','좌우 드래그'],flappy:['플래피 버드','파이프 사이로 날아보세요','날갯짓'],runner:['공룡 달리기','선인장을 뛰어넘으세요','점프'],bounce:['공 피하기','공과 테두리를 피해 버티세요','드래그 이동'],tower:['타워 점프','움직이는 발판에 맞춰 점프하세요','점프']};
export function drawExtra(ctx,g,W,H,drawPlayer) {
  if(['rain','traffic','breakout'].includes(g.kind)) {
    ctx.fillStyle=g.kind==='traffic'?'#303849':'#edf4ff';ctx.fillRect(0,0,W,H);
    if(g.kind==='traffic') {
      ctx.strokeStyle='#ffffff77';ctx.lineWidth=2;ctx.setLineDash([18,18]);
      for(let i=1;i<8;i++){ctx.beginPath();ctx.moveTo(i*45,0);ctx.lineTo(i*45,H);ctx.stroke();}ctx.setLineDash([]);
    }
    for(const b of g.obstacles) {
      ctx.fillStyle=g.kind==='rain'?'#3a91dc':b.motorcycle?'#ffc857':'#a894ff';ctx.fillRect(b.x,b.y,b.w,b.h);
      if(g.kind==='traffic'){ctx.fillStyle='#142136';ctx.fillRect(b.x+3,b.y+8,b.w-6,9);ctx.fillStyle='#fff4ae';ctx.fillRect(b.x+2,b.y+b.h-5,4,3);ctx.fillRect(b.x+b.w-6,b.y+b.h-5,4,3);}
    }
    if(g.kind==='breakout') {
      for(const b of g.bricks){ctx.fillStyle=['#9775fa','#748ffc','#4dabf7','#38d9a9','#ffd43b'][Math.round((b.y-55)/25)];ctx.fillRect(b.x,b.y,b.w,b.h);}
      ctx.fillStyle='#6545cb';ctx.fillRect(g.paddleX-42,395,84,12);
      ctx.save();ctx.translate(g.x,g.y);ctx.scale(.6,.6);drawPlayer(ctx,0,0);ctx.restore();
    } else drawPlayer(ctx,g.x,g.y);
    return true;
  }
  if(g.kind==='bounce') {
    ctx.fillStyle='#f6f4ff';ctx.fillRect(0,0,W,H);
    ctx.save();ctx.beginPath();ctx.arc(ARENA.x,ARENA.y,ARENA.radius,0,Math.PI*2);
    ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#a68bdc';ctx.lineWidth=2;ctx.stroke();ctx.clip();
    for(const ball of g.balls){ctx.beginPath();ctx.arc(ball.x,ball.y,ARENA.ballRadius,0,Math.PI*2);ctx.fillStyle=`hsl(${ball.hue} 70% 55%)`;ctx.fill();}
    drawPlayer(ctx,g.x,g.y);ctx.restore();
    ctx.fillStyle='#655878';ctx.font='13px sans-serif';ctx.textAlign='center';
    ctx.fillText(t('어디서든 드래그해서 이동하세요'),W/2,30);
    ctx.fillText(t('생존 3초마다 1점'),W/2,H-20);
    return true;
  }
  if(g.kind!=='tower')return false;
  ctx.fillStyle='#f6f4ff';ctx.fillRect(0,0,W,H);
  const camera=g.cameraY ?? g.score*120;
  // World coordinates stay fixed after landing; only the camera moves upward.
  ctx.save();ctx.translate(0,camera);
  const block=(x,y,w,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,16);ctx.fillStyle='#ffffff66';ctx.fillRect(x,y,w,4);};
  const platforms=g.platforms || [{x:180,y:365-g.score*120}];
  platforms.forEach((p,i)=>{block(p.x-62,p.y,124,'#b4a8e8');ctx.fillStyle='#8974b7';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(String(Math.round((365-p.y)/120)),p.x,p.y+30);});
  block(g.x-62,365-(g.score+1)*120,124,'#6545cb');
  const flight=g.airborne?Math.min(1,g.flight/.8):0;
  const feet=365-g.score*120-120*flight-100*Math.sin(Math.PI*flight);
  drawPlayer(ctx,180,feet-19);
  ctx.restore();
  ctx.fillStyle='#655878';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText(t('점프 후 발판 중앙에 착지하세요'),180,36);
  return true;
}
