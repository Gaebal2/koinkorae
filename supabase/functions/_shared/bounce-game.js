export const ARENA = { x: 180, y: 220, radius: 158, playerRadius: 14, ballRadius: 7.5, speed: 100 };
export const MOVE_SCALE = 16;
export function newBounceGame() {
  return {kind:'bounce',time:0,score:0,ended:false,reason:'',x:ARENA.x,y:ARENA.y,balls:[],nextBall:3};
}
const distanceToSegment = (px,py,x1,y1,x2,y2) => {
  const dx=x2-x1,dy=y2-y1,length=dx*dx+dy*dy;
  const t=length ? Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/length)) : 0;
  return Math.hypot(px-x1-t*dx,py-y1-t*dy);
};
export function moveBouncePlayer(game,dx,dy) {
  if(game.ended || game.kind!=='bounce')return;
  const x=game.x+dx,y=game.y+dy;
  if(game.balls.some(b=>distanceToSegment(b.x,b.y,game.x,game.y,x,y)<=ARENA.playerRadius+ARENA.ballRadius)) {
    game.ended=true;game.reason='collision';
  }
  game.x=x;game.y=y;
  const distance=Math.hypot(x-ARENA.x,y-ARENA.y),limit=ARENA.radius-ARENA.playerRadius;
  if(distance>=limit) {
    game.x=ARENA.x+(x-ARENA.x)*limit/distance;game.y=ARENA.y+(y-ARENA.y)*limit/distance;
    game.ended=true;game.reason='border';
  }
}
export function stepBounce(game,dt,random) {
  game.time+=dt;
  while(game.time+1e-9>=game.nextBall) {
    const angle=random()*Math.PI*2,dx=Math.cos(angle),dy=Math.sin(angle);
    const radius=ARENA.radius-ARENA.ballRadius;
    game.balls.push({x:ARENA.x+radius*dx,y:ARENA.y+radius*dy,vx:-dx*ARENA.speed,vy:-dy*ARENA.speed,hue:Math.floor(random()*360)});
    game.score++;game.nextBall+=3;
  }
  for(const ball of game.balls) {
    const oldX=ball.x,oldY=ball.y;
    ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
    const dx=ball.x-ARENA.x,dy=ball.y-ARENA.y,distance=Math.hypot(dx,dy),limit=ARENA.radius-ARENA.ballRadius;
    if(distance>=limit) {
      ball.x=ARENA.x+dx*limit/distance;ball.y=ARENA.y+dy*limit/distance;
      // Like the supplied game, the circular wall sends the ball toward the center.
      ball.vx=-dx/distance*ARENA.speed;ball.vy=-dy/distance*ARENA.speed;
    }
    if(distanceToSegment(game.x,game.y,oldX,oldY,ball.x,ball.y)<=ARENA.playerRadius+ARENA.ballRadius) {
      game.ended=true;game.reason='collision';
    }
  }
  for(let i=0;i<game.balls.length;i++)for(let j=i+1;j<game.balls.length;j++) {
    const a=game.balls[i],b=game.balls[j],dx=a.x-b.x,dy=a.y-b.y;
    // Swap directions only when approaching, to avoid oscillating while overlapping.
    if(Math.hypot(dx,dy)<ARENA.ballRadius*2 && dx*(a.vx-b.vx)+dy*(a.vy-b.vy)<0) {
      [a.vx,b.vx]=[b.vx,a.vx];[a.vy,b.vy]=[b.vy,a.vy];
    }
  }
  return game;
}
