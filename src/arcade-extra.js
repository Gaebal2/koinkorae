import { t } from './language.js';
export const gameLabels={flappy:['플래피 버드','파이프 사이로 날아보세요','날갯짓'],runner:['공룡 달리기','선인장을 뛰어넘으세요','점프'],tower:['타워 점프','움직이는 발판에 맞춰 점프하세요','점프']};
export function drawExtra(ctx,g,W,H,drawPlayer) {
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
  drawPlayer(ctx,180,feet-14,28);
  ctx.restore();
  ctx.fillStyle='#655878';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText(t('점프 후 발판 중앙에 착지하세요'),180,36);
  return true;
}
