export const FEED_CATEGORIES = ['지지', '최신', '논쟁', '좋아요', '팔로잉', '급상승'];
export const defaultOptions = { feed: '유저 피드', category: '최신', period: '전체' };
function validatedOptions(value) {
  const options = { ...defaultOptions };
  for (const [key, allowed] of Object.entries({feed:['유저 피드','코인 피드'],category:FEED_CATEGORIES,period:['오늘','이번 달','올해','전체']})) {
    if (allowed.includes(value?.[key])) options[key] = value[key];
  }
  return options;
}
export function readViewState(storage, preferences) {
  let options = { ...defaultOptions };
  try { options = validatedOptions(JSON.parse((preferences ?? window.localStorage).getItem('korae-feed-preferences') || '{}')); } catch {}

  try {
    storage ??= window.sessionStorage;
    const value = JSON.parse(storage.getItem('korae-view') || '{}');
    return { page: ['home', 'check', 'profile', 'map', 'chat', 'battle', 'points'].includes(value?.page) ? value.page : 'home', profileId: typeof value?.profileId === 'string' ? value.profileId : null, options };
  } catch { return { page: 'home', profileId: null, options }; }
}
export function saveViewState(storage, value, preferences) {
  try { (storage ?? window.sessionStorage).setItem('korae-view', JSON.stringify({ page: value.page, profileId: value.profileId })); } catch {}
  try { (preferences ?? window.localStorage).setItem('korae-feed-preferences', JSON.stringify(validatedOptions(value.options))); } catch {}
}
export function readMapCamera(){try{const value=JSON.parse(sessionStorage.getItem('korae-camera'));if(value&&Number.isFinite(value.lat)&&Math.abs(value.lat)<=90&&Number.isFinite(value.lng)&&Number.isFinite(value.zoom))return value;}catch{}return {lat:37.5665,lng:126.978,zoom:14};}
export function saveMapCamera(value){try{sessionStorage.setItem('korae-camera',JSON.stringify(value));}catch{}}
