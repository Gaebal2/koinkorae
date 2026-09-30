import { MOVE_SCALE } from './battle-engine.js';

// A new contact anchors the finger, never the character. Deltas use canvas units.
export function createRelativeDrag() {
  let pointer=null, dx=0, dy=0;
  return {
    begin(id,x,y) { if(pointer)return false;pointer={id,x,y};return true; },
    move(id,x,y,scaleX,scaleY) {
      if(pointer?.id!==id)return;
      dx+=(x-pointer.x)*scaleX;dy+=(y-pointer.y)*scaleY;
      pointer={id,x,y};
    },
    end(id) { if(pointer?.id===id)pointer=null; },
    reset() { pointer=null;dx=0;dy=0; },
    take() {
      const x=Math.max(-360*MOVE_SCALE,Math.min(360*MOVE_SCALE,Math.round(dx*MOVE_SCALE)));
      const y=Math.max(-440*MOVE_SCALE,Math.min(440*MOVE_SCALE,Math.round(dy*MOVE_SCALE)));
      dx-=x/MOVE_SCALE;dy-=y/MOVE_SCALE;
      return [x,y];
    },
  };
}
