export function shareUrl(kind, id, base = window.location.href) {
 const url = new URL(base); url.search = ''; url.hash = ''; url.searchParams.set(kind, id); return url.href;
}
export async function shareContent(payload, browser = navigator) {
 if(browser.share) { try { await browser.share(payload); return 'shared'; } catch(error) { if(error.name === 'AbortError') return 'cancelled'; } }
 if(browser.clipboard?.writeText) { try { await browser.clipboard.writeText(payload.url); return 'copied'; } catch {} }
 return 'manual';
}
