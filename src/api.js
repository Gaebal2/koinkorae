const base = import.meta.env.VITE_API_URL || '/api';
const crossOrigin = new URL(base, window.location.href).origin !== window.location.origin;
const sessionKey = 'battlefeed.remote-session';
let sessionToken = '';
if (crossOrigin) {
  try { sessionToken = sessionStorage.getItem(sessionKey) || ''; } catch {}
}
function rememberSession(value) {
  sessionToken = value;
  try { if (value) sessionStorage.setItem(sessionKey, value); else sessionStorage.removeItem(sessionKey); } catch {}
}
export async function api(path, method = 'GET', body) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method, credentials: crossOrigin ? 'omit' : 'include', cache: 'no-store',
      headers: {
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-BattleFeed-Request': '1' }),
        ...(crossOrigin ? { 'X-BattleFeed-Auth': 'bearer', ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) } : {}),
      },
      ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}),
    });
  } catch { throw Error('서버에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도하세요.'); }
  const type = response.headers.get('content-type');
  if (!type?.includes('application/json')) throw Error('서비스 연결을 준비 중입니다. 잠시 후 다시 시도하세요.');
  const data = await response.json();
  if (!response.ok) { if (response.status === 401 && crossOrigin) rememberSession(''); throw Error(data.error || '요청을 처리하지 못했습니다.'); }
  if (crossOrigin && ['/auth/login', '/auth/register'].includes(path) && data.sessionToken) {
    rememberSession(data.sessionToken);
    return data.user;
  }
  if (crossOrigin && (path === '/auth/logout' || (path === '/me' && data === null))) rememberSession('');
  return data;
}
export const age = time => {
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  return minutes < 1 ? '방금' : minutes < 60 ? `${minutes}분 전` : minutes < 1440 ? `${Math.floor(minutes / 60)}시간 전` : new Date(time).toLocaleDateString();
};
export const presentationPost = post => ({ ...post, age: age(post.createdAt), initials: post.author.slice(0, 2).toUpperCase(), tone: 'purple' });
export async function readPhoto(file) {
  if (!file) return '';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw Error('사진은 2MB 이하 PNG, JPEG, WebP 파일을 선택하세요.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      const encoded = canvas.toDataURL('image/jpeg', quality);
      if (encoded.length <= 300000) return encoded;
    }
    throw Error('사진 용량이 큽니다. 더 작은 사진을 선택해 주세요.');
  } finally { bitmap.close(); }
}
