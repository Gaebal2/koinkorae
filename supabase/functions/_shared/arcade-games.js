const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const hit=(x,y,r,b)=>x+r>b.x&&x-r<b.x+b.w&&y+r>b.y&&y-r<b.y+b.h;
const bricks=()=>Array.from({length:40},(_,i)=>({x:12+i%8*42,y:55+Math.floor(i/8)*25,w:38,h:19}));
export function newArcadeGame(kind) {
  const game={kind,time:0,simulationTime:0,score:0,ended:false,reason:'',x:180,y:390,obstacles:[],nextObstacle:.7};
  if(kind==='breakout')Object.assign(game,{y:345,vx:100,vy:-190,paddleX:180,bricks:bricks()});
  return game;
}
export function moveArcadePlayer(g,dx) {
  if(g.ended)return;
  if(g.kind==='breakout')g.paddleX=clamp(g.paddleX+dx,42,318);
  else if(['rain','traffic'].includes(g.kind)) {
    const target=clamp(g.x+dx,14,346);
    if(g.obstacles.some(b=>g.y+12>b.y&&g.y-12<b.y+b.h&&Math.max(g.x,target)+12>b.x&&Math.min(g.x,target)-12<b.x+b.w)){g.ended=true;g.reason='collision';}
    g.x=target;
  }
}
export function stepArcade(g,dt,random) {
  g.simulationTime+=dt;
  if(g.kind!=='breakout') {
    while(g.simulationTime>=g.nextObstacle) {
      const traffic=g.kind==='traffic',motorcycle=traffic&&random()<.35;
      const w=traffic?(motorcycle?13:29):5,h=traffic?(motorcycle?32:48):24;
      const x=traffic?Math.floor(random()*8)*45+(45-w)/2:8+random()*339;
      g.obstacles.push({x,y:-h,w,h,motorcycle});g.nextObstacle+=traffic?.48:.2;
    }
    for(const b of g.obstacles){b.y+=(g.kind==='traffic'?155:210)*dt;if(hit(g.x,g.y,12,b)){g.ended=true;g.reason='collision';}}
    g.obstacles=g.obstacles.filter(b=>b.y<460);return g;
  }
  const oldY=g.y;g.x+=g.vx*dt;g.y+=g.vy*dt;
  if(g.x<10||g.x>350){g.x=clamp(g.x,10,350);g.vx*=-1;}
  if(g.y<10){g.y=10;g.vy=Math.abs(g.vy);}
  if(g.vy>0&&oldY+10<=395&&g.y+10>=395&&Math.abs(g.x-g.paddleX)<=52){g.y=385;const angle=clamp((g.x-g.paddleX)/42,-1,1)*1.05;g.vx=220*Math.sin(angle);g.vy=-220*Math.cos(angle);}
  const index=g.bricks.findIndex(b=>hit(g.x,g.y,10,b));
  if(index>=0){const b=g.bricks[index];if(oldY+10<=b.y||oldY-10>=b.y+b.h)g.vy*=-1;else g.vx*=-1;g.bricks.splice(index,1);g.score++;}
  if(g.y>450){g.ended=true;g.reason='miss';}
  if(!g.bricks.length){g.bricks=bricks();g.x=g.paddleX;g.y=345;g.vx=100;g.vy=-190;}
  return g;
}
