// Only web URLs become anchors; user content is rendered as React text.
const webLink = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
export function contentParts(value = '') {
 const text = String(value), parts = []; let end = 0;
 for (const match of text.matchAll(webLink)) {
  let label = match[0].replace(/[.,!?;:。。，！？]+$/u, '');
  while (/[)\]}]$/.test(label)) {
   const close = label.at(-1), open = {')':'(',']':'[','}':'{'}[close];
   if (label.split(close).length <= label.split(open).length) break;
   label = label.slice(0,-1);
  }
  try {
   const url = new URL(/^www\./i.test(label) ? `https://${label}` : label);
   if (!url.hostname || url.username || url.password) continue;
   if (match.index > end) parts.push({text:text.slice(end,match.index)});
   parts.push({text:label,href:url.href}); end=match.index+label.length;
  } catch {}
 }
 if (end < text.length) parts.push({text:text.slice(end)});
 return parts;
}
export function youtubeVideo(href) {
 try {
  const url = new URL(href), host=url.hostname.toLowerCase(); let id;
  if (host==='youtu.be') id=url.pathname.slice(1);
  else if (['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)) {
   id=url.pathname==='/watch' ? url.searchParams.get('v') : /^\/(?:shorts|embed|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  }
  if (!/^[\w-]{11}$/.test(id||'')) return null;
  const raw=url.searchParams.get('t')||url.searchParams.get('start')||'';
  const time=/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  const start=/^\d+$/.test(raw)?Number(raw):time?Number(time[1]||0)*3600+Number(time[2]||0)*60+Number(time[3]||0):0;
  return {id,start:Number.isSafeInteger(start)?start:0};
 } catch { return null; }
}
