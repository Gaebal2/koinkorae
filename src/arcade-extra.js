export const gameLabels={flappy:['플래피 버드','파이프 사이로 날아보세요','날갯짓'],runner:['공룡 달리기','선인장을 뛰어넘으세요','점프'],stack:['스택 쌓기','블록이 겹칠 때 터치하세요','블록 놓기'],tower:['타워 점프','움직이는 발판에 맞춰 점프하세요','점프'],dodge:['두 레인 피하기','터치해서 차선을 바꾸세요','차선 변경']};
export function drawExtra(ctx,g,W,H) {
  if(!['stack','tower','dodge'].includes(g.kind))return false;
  ctx.fillStyle='#f6f4ff';ctx.fillRect(0,0,W,H);
  const block=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);ctx.fillStyle='#ffffff55';ctx.fillRect(x,y,w,4);ctx.fillStyle='#00000018';ctx.fillRect(x+w-5,y,5,h);};
  if(g.kind==='stack'){
    const count=g.blocks.length;block(90,400,180,22,'#b4a8e8');
    g.blocks.forEach((b,i)=>block(b.x,378-(i)*25,b.w,22,`hsl(${255+i*5} 65% ${62-i*2}%)`));
    block(g.x,378-count*25,g.width,22,'#6545cb');
    ctx.fillStyle='#655878';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText('겹치는 부분만 남아요',180,48);
  }else if(g.kind==='tower'){
    block(130,365,100,16,'#b4a8e8');block(g.x-62,245,124,16,'#6545cb');
    const t=g.airborne?Math.min(1,g.flight/.8):0,y=350-120*t-100*Math.sin(Math.PI*t);
    ctx.fillStyle='#e9a13b';ctx.beginPath();ctx.arc(180,y-14,14,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#d4cbee';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(180,90);ctx.lineTo(180,225);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#655878';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText('점프 후 발판 중앙에 착지하세요',180,48);
  }else{
    ctx.fillStyle='#ece9f5';ctx.fillRect(60,0,240,H);ctx.strokeStyle='#fff';ctx.setLineDash([15,14]);ctx.beginPath();ctx.moveTo(180,0);ctx.lineTo(180,H);ctx.stroke();ctx.setLineDash([]);
    g.obstacles.forEach(o=>block(o.lane===0?98:218,o.y,44,30,'#e06a7c'));
    block(g.lane===0?106:226,330,28,28,'#6545cb');
  }
  return true;
}
