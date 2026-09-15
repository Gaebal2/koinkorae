export function coinRanks(posts) {
  const totals = new Map();
  for (const p of posts) totals.set(p.coin, (totals.get(p.coin) || 0) + p.support - p.oppose);
  return new Map([...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([coin], i) => [coin, i + 1]));
}
export function relationshipsFor(edges, uid) {
  const following = [...new Set(edges.filter(e => e.from === uid).map(e => e.to))];
  const followers = [...new Set(edges.filter(e => e.to === uid).map(e => e.from))];
  return { following, followers, friends: following.filter(id => followers.includes(id)) };
}
export function tierFor(lifetime) {
  const tier = lifetime >= 10000 ? 'Gold' : lifetime >= 1000 ? 'Silver' : 'Bronze';
  const next = tier === 'Bronze' ? 1000 : tier === 'Silver' ? 10000 : null;
  return { tier, next, progress: next ? Math.min(100, lifetime / next * 100) : 100 };
}
