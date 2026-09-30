// Feed display only. Keep calculations and stored values at full precision.
export function formatCompactNumber(value) {
  if (!Number.isFinite(value)) return '0';
  const magnitude = Math.abs(value);
  if (magnitude < 1000) return String(Math.trunc(value) || 0);
  const units = ['K', 'M', 'B'];
  let unit = magnitude >= 1e9 ? 2 : magnitude >= 1e6 ? 1 : 0;
  let rounded = Math.round(magnitude / (1000 ** (unit + 1)) * 10) / 10;
  if (rounded >= 1000 && unit < 2) { unit++; rounded = 1; }
  return `${value < 0 ? '-' : ''}${rounded.toFixed(1)}${units[unit]}`;
}
