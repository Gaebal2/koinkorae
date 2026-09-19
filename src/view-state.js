export const defaultOptions = { feed: '유저 피드', category: '최신', period: '오늘' };
export function readViewState(storage) {
  try {
    storage ??= window.sessionStorage;
    const value = JSON.parse(storage.getItem('korae-view') || '{}');
    const options = { ...defaultOptions };
    return { page: ['home', 'check', 'profile', 'map'].includes(value?.page) ? value.page : 'home', profileId: typeof value?.profileId === 'string' ? value.profileId : null, options };
  } catch { return { page: 'home', profileId: null, options: { ...defaultOptions } }; }
}
export function saveViewState(storage, value) {
  try { (storage ?? window.sessionStorage).setItem('korae-view', JSON.stringify({ page: value.page, profileId: value.profileId })); } catch { /* Storage can be disabled in private browsing. */ }
}
