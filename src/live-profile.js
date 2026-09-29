import { useCallback, useSyncExternalStore } from 'react';
import { data } from './data.js';

const entries = new Map();
function entry(id) {
  if (!entries.has(id)) entries.set(id, { value:null, listeners:new Set(), stop:null });
  return entries.get(id);
}
export function publishProfile(profile) {
  if (!profile?.id) return;
  const e=entry(profile.id); e.value=profile; e.listeners.forEach(fn=>fn());
}
export function useLiveProfile(id) {
  return useSyncExternalStore(useCallback(callback => {
    if (!id) return () => {};
    const e=entry(id); e.listeners.add(callback);
    if (!e.stop) e.stop=data.watchProfile(id, publishProfile, () => {});
    return () => { e.listeners.delete(callback); if (!e.listeners.size) { e.stop?.(); e.stop=null; } };
  }, [id]), () => id ? entry(id).value : null);
}
