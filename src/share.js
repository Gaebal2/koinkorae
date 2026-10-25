// Remove addresses, including bare domains that receiving apps may auto-link.
export function shareText(value = '') {
 return String(value)
  .replace(/\[([^\]]*)\]\([^\s)]*\)/g, '$1')
  .replace(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>]+/gi, '')
  .replace(/(?:[\p{L}\p{N}_%+-]+@)?(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,63}(?::\d+)?(?:[/?#][^\s<>]*)?/gu, '')
  .replace(/[ \t]+/g, ' ').trim();
}
export function shareCopy(payload) {
 return [shareText(payload.text),payload.url].filter(Boolean).join('\n\n');
}
export function shareUrl(kind, id, base = 'https://koinkorae.com/') {
 const url = new URL(base); url.search = ''; url.hash = ''; url.searchParams.set(kind, id); return url.href;
}
export async function shareContent(payload, browser = navigator) {
 if(browser.share) { try { await browser.share(payload); return 'shared'; } catch(error) { if(error.name === 'AbortError') return 'cancelled'; } }
 if(browser.clipboard?.writeText) { try { await browser.clipboard.writeText(shareCopy(payload)); return 'copied'; } catch {} }
 return 'manual';
}
