import { ARENA } from './battle-engine.js';
import { t } from './language.js';
export const gameLabels={flappy:['플래피 버드','파이프 사이로 날아보세요','날갯짓'],runner:['공룡 달리기','선인장을 뛰어넘으세요','점프'],bounce:['공 피하기','공과 테두리를 피해 버티세요','드래그 이동'],tower:['타워 점프','움직이는 발판에 맞춰 점프하세요','점프']};
export function drawExtra(ctx,g,W,H,drawPlayer) {
  if(g.kind==='bounce') {
    ctx.fillStyle='#f6f4ff';ctx.fillRect(0,0,W,H);
    ctx.save();ctx.beginPath();ctx.arc(ARENA.x,ARENA.y,ARENA.radius,0,Math.PI*2);
    ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#a68bdc';ctx.lineWidth=2;ctx.stroke();ctx.clip();
    for(const ball of g.balls){ctx.beginPath();ctx.arc(ball.x,ball.y,ARENA.ballRadius,0,Math.PI*2);ctx.fillStyle=`hsl(${ball.hue} 70% 55%)`;ctx.fill();}
    drawPlayer(ctx,g.x,g.y);ctx.restore();
    ctx.fillStyle='#655878';ctx.font='13px sans-serif';ctx.textAlign='center';
    ctx.fillText(t('어디서든 드래그해서 이동하세요'),W/2,30);
    ctx.fillText(t('3초마다 공 추가 · 공 1개 = 1점'),W/2,H-20);
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
