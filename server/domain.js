import { randomInt } from 'node:crypto';

export const defaults = Object.freeze({ battleCost: 1, pinCost: 1, checkinReward: 10, adReward: 20, adDailyLimit: 3, silver: 1000, gold: 10000, gameDuration: 10000 });
export const categories = ['판매', '구매 희망', '서비스', '사업장'];
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function text(value, name, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(`${name}은(는) ${min}~${max}자로 입력하세요.`);
  return value.trim();
}
export function timezone(value) {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); } catch { fail('올바른 시간대가 필요합니다.'); }
  if (typeof value !== 'string' || !value) fail('시간대가 필요합니다.');
  return value;
}
export function localDate(time, zone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
}
export function inPeriod(time, now, zone, period) {
  if (period === '전체') return time <= now;
  const size = { '오늘': 10, '이번 달': 7, '올해': 4 }[period];
  if (!size) fail('잘못된 기간입니다.');
  return time <= now && localDate(time, zone).slice(0, size) === localDate(now, zone).slice(0, size);
}
export function tier(bp, config) {
  return bp >= config.gold ? { name: 'Gold', limit: 3 } : bp >= config.silver ? { name: 'Silver', limit: 2 } : { name: 'Bronze', limit: 1 };
}
export function makeChallenge(config) {
  const game = ['speed', 'timing', 'reaction'][randomInt(3)];
  return { game, duration: config.gameDuration, targets: Array.from({ length: 5 }, (_, i) => ({ at: 700 + i * 1800 + randomInt(400), lane: randomInt(3) })) };
}
// Scores are recomputed from input timing. Client-submitted totals are never used.
export function scoreTrace(challenge, trace, elapsed) {
  if (!Array.isArray(trace) || trace.length > 160) fail('비정상 입력 기록입니다.');
  if (elapsed < challenge.duration - 100 || elapsed > challenge.duration + 110000) fail('게임 시간이 올바르지 않습니다.');
  let previous = -1000;
  for (const input of trace) {
    if (!input || !Number.isFinite(input.t) || input.t < 0 || input.t > challenge.duration || input.t - previous < 65) fail('불가능한 입력 간격입니다.');
    if (!Number.isInteger(input.lane) || input.lane < 0 || input.lane > 2) fail('잘못된 입력입니다.');
    previous = input.t;
  }
  if (challenge.game === 'speed') return Math.min(100, trace.length * 2);
  const used = new Set();
  return trace.reduce((sum, input) => {
    const index = challenge.targets.findIndex((target, i) => !used.has(i) && (challenge.game === 'timing'
      ? Math.abs(input.t - target.at) <= 350
      : input.lane === target.lane && input.t - target.at >= 100 && input.t - target.at <= 900));
    if (index < 0) return sum;
    used.add(index);
    const delta = challenge.game === 'timing' ? Math.abs(input.t - challenge.targets[index].at) : input.t - challenge.targets[index].at - 100;
    return sum + Math.max(1, Math.round(20 * (1 - delta / (challenge.game === 'timing' ? 400 : 1000))));
  }, 0);
}
export function statistics(values) {
  if (!values.length) return { count: 0, mean: 0, median: 0, variance: 0 };
  const sorted = [...values].sort((a, b) => a - b), n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return { count: n, mean, median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2, variance: values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n };
}
