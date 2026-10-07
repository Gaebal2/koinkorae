import { photo } from './validation.js';

export const MEDIA_BUCKET = 'community-media';
// Content-addressed files are immutable, so the browser can cache them for a year.
export function createPhotoStore({ baseUrl, upload }) {
  const prefix = baseUrl.replace(/\/$/, '') + '/storage/v1/object/public/' + MEDIA_BUCKET + '/';
  return async function storePhoto(value = '') {
    if (!value) return photo(value);
    if (typeof value === 'string' && value.startsWith(prefix) && /^[a-f0-9]{64}\.(jpeg|png|webp)$/.test(value.slice(prefix.length))) return value;
    photo(value);
    const [header, encoded] = value.split(',');
    const type = header.slice(5, header.indexOf(';'));
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    const key = hash + '.' + type.slice(6);
    await upload(key, bytes, { contentType: type, cacheControl: '31536000', upsert: false });
    return prefix + key;
  };
}
