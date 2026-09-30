import {periodStart} from './feed-period.js';

export function recentActivityScore(activity = [], now = Date.now(), since = 0) {
  const minute = Math.floor(now / 60000);
  return Math.floor(activity.reduce((sum, event) => {
    const age = minute - Math.floor(event.createdAt / 60000);
    return event.createdAt < since || event.createdAt > now ? sum : sum + Math.abs(event.amount ?? 1) * 1000000 / (1 + age);
  }, 0));
}

export function filterFeed(posts, { category, period }, following = [], now = Date.now()) {
  const date = time => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
  const length = { '오늘': 10, '이번 달': 7, '올해': 4 }[period];
  const score = p => category === '최신' ? p.createdAt : category === '좋아요' ? (p.likeCount || 0) : category === '논쟁' ? Math.abs(p.support) + Math.abs(p.oppose) : category === '급상승' ? recentActivityScore(p.recentActivity, now, periodStart(period, now)) : p.support - p.oppose;
  const items = posts.filter(p => p.createdAt <= now && (category === '급상승' || !length || date(p.createdAt).slice(0, length) === date(now).slice(0, length)) && (category !== '팔로잉' || following.includes(p.authorId)))
    .sort((a, b) => score(b) - score(a) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  const groups = new Map();
  for (const post of items) {
    const group = groups.get(post.coin) || { coin: post.coin, score: category === '최신' ? -Infinity : 0, items: [] };
    group.items.push(post); group.score = category === '최신' ? Math.max(group.score, score(post)) : group.score + score(post);
    groups.set(post.coin, group);
  }
  return { posts: items, groups: [...groups.values()].sort((a, b) => b.score - a.score || a.coin.localeCompare(b.coin)) };
}
