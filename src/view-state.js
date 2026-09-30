export const defaultOptions = { feed: '유저 피드', category: '최신', period: '오늘' };
export function readViewState(storage) {
  try {
    storage ??= window.sessionStorage;
    const value = JSON.parse(storage.getItem('korae-view') || '{}');
    const options = { ...defaultOptions };
    for(const [key,allowed] of Object.entries({feed:['유저 피드','코인 피드'],category:['최신','지지','팔로잉','급상승','논쟁'],period:['오늘','이번 달','올해','전체']}))if(allowed.includes(value.options?.[key]))options[key]=value.options[key];
    return { page: ['home', 'check', 'profile', 'map', 'chat'].includes(value?.page) ? value.page : 'home', profileId: typeof value?.profileId === 'string' ? value.profileId : null, options };
  } catch { return { page: 'home', profileId: null, options: { ...defaultOptions } }; }
}
export function saveViewState(storage, value) {
  try { (storage ?? window.sessionStorage).setItem('korae-view', JSON.stringify({ page: value.page, profileId: value.profileId,options:value.options })); } catch { /* Storage can be disabled in private browsing. */ }
}
export function readMapCamera(){try{const value=JSON.parse(sessionStorage.getItem('korae-camera'));if(value&&Number.isFinite(value.lat)&&Math.abs(value.lat)<=90&&Number.isFinite(value.lng)&&Number.isFinite(value.zoom))return value;}catch{}return {lat:37.5665,lng:126.978,zoom:14};}
export function saveMapCamera(value){try{sessionStorage.setItem('korae-camera',JSON.stringify(value));}catch{}}
