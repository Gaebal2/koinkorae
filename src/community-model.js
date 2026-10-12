import {levelFor} from '../supabase/functions/_shared/points-policy.js';
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
export function tierFor(balance={}) {
  const result=levelFor(typeof balance==='number'?{lifetime:balance}:balance);
  return {tier:result.current.name,next:result.next?.bp??null,progress:result.progress};
}
