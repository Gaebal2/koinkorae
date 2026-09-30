// Shared Canvas character: decorations stay outside the coin's white disc.
export const CHARACTER_SIZE = 28;
export const CHARACTER_ICON_SIZE = 20;
export function drawCoinCharacter(ctx, { x, y, icon, symbol, kind, time = 0, airborne = false }) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#b9a5f1';
  const flap = Math.sin(time * 16) * (kind === 'flappy' ? 0.6 : 0.2);
  ctx.beginPath(); ctx.ellipse(-17, 1, 7, 4, flap, 0, Math.PI * 2); ctx.fill();
  if (kind === 'flappy') {
    ctx.fillStyle = '#F6B133'; ctx.beginPath();
    ctx.moveTo(13, -3); ctx.lineTo(22, 1); ctx.lineTo(13, 5); ctx.fill();
  } else {
    ctx.strokeStyle = '#8a67c7'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    const stride = kind === 'runner' && !airborne ? Math.sin(time * 20) * 2 : 0;
    for (const sign of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sign * 6, 13); ctx.lineTo(sign * 7 + stride * sign, 18);
      ctx.lineTo(sign * 10 + stride * sign, 18); ctx.stroke();
    }
  }
  ctx.shadowColor = '#44336b33'; ctx.shadowBlur = 5;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, CHARACTER_SIZE / 2, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  if (icon?.complete && icon.naturalWidth) {
    const scale = CHARACTER_ICON_SIZE / Math.max(icon.naturalWidth, icon.naturalHeight);
    const width = icon.naturalWidth * scale, height = icon.naturalHeight * scale;
    ctx.drawImage(icon, -width / 2, -height / 2, width, height);
  } else {
    ctx.fillStyle = '#7157ff'; ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(symbol.slice(0, 4), 0, 0);
  }
  ctx.restore();
}
