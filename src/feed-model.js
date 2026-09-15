export function filterFeed(posts, { category, period }, following = [], now = Date.now()) {
  const date = time => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
  const length = { '오늘': 10, '이번 달': 7, '올해': 4 }[period];
  const score = p => category === '최신' ? p.createdAt : category === '논쟁' ? Math.min(p.support, p.oppose) : category === '급상승' ? p.support + p.oppose : p.support - p.oppose;
  const items = posts.filter(p => p.createdAt <= now && (!length || date(p.createdAt).slice(0, length) === date(now).slice(0, length)) && (category !== '팔로잉' || following.includes(p.authorId)))
    .sort((a, b) => score(b) - score(a) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  const groups = new Map();
  for (const post of items) {
    const group = groups.get(post.coin) || { coin: post.coin, score: category === '최신' ? -Infinity : 0, items: [] };
    group.items.push(post); group.score = category === '최신' ? Math.max(group.score, score(post)) : group.score + score(post);
    groups.set(post.coin, group);
  }
  return { posts: items, groups: [...groups.values()].sort((a, b) => b.score - a.score || a.coin.localeCompare(b.coin)) };
}
