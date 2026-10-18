// The worker serializes badge changes with incoming pushes, including while the app is closed.
export async function markDeviceNotificationsRead(before=Date.now(),reset=false) {
 if(!globalThis.navigator?.serviceWorker)return;
 try {
  const worker=await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  const active=worker?.active||navigator.serviceWorker.controller;
  if(active)active.postMessage(reset?{type:'RESET_BADGE'}:{type:'READ_NOTIFICATIONS',before});
  else await navigator.clearAppBadge?.();
 }catch{}
}
