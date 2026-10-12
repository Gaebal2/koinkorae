import { WIDTH, HEIGHT, GROUND } from './battle-engine.js';
export const hasGestureSpace = kind => ['rain', 'traffic', 'breakout'].includes(kind);
export const surfaceHeight = kind => kind === 'runner' || hasGestureSpace(kind) ? HEIGHT + (HEIGHT - GROUND) * 2 : HEIGHT;
export function drawGestureSpace(ctx, kind, label) {
  if (!hasGestureSpace(kind)) return;
  ctx.save();
  ctx.fillStyle = '#eeeaff';
  ctx.fillRect(0, HEIGHT, WIDTH, surfaceHeight(kind) - HEIGHT);
  ctx.fillStyle = '#c8bdf3';
  ctx.fillRect(0, HEIGHT, WIDTH, 1);
  ctx.fillStyle = '#75668e';
  ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, WIDTH / 2, (HEIGHT + surfaceHeight(kind)) / 2);
  ctx.restore();
}
