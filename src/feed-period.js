// Calendar filters use the app's existing Korea Standard Time boundaries.
export function periodStart(period, now = Date.now()) {
  const date = new Date(now + 9 * 3600000);
  const year = date.getUTCFullYear(), month = date.getUTCMonth(), day = date.getUTCDate();
  if (period === '오늘') return Date.UTC(year, month, day) - 9 * 3600000;
  if (period === '이번 달') return Date.UTC(year, month, 1) - 9 * 3600000;
  if (period === '올해') return Date.UTC(year, 0, 1) - 9 * 3600000;
  return 0;
}

export function feedOptions(options, now = Date.now()) {
  const since = periodStart(options.period, now);
  return {mode:options.feed==='코인 피드'?'coins':'posts',category:options.category,
    ...(options.category==='급상승' ? {activitySince:since} : since ? {since} : {})};
}
