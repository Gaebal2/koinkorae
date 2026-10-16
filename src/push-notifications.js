export function pushSupported() {
 return typeof window!=='undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
async function registration() {
 await navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js',{updateViaCache:'none'});
 return navigator.serviceWorker.ready;
}
function applicationKey(value) {
 const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
 return Uint8Array.from(raw,char=>char.charCodeAt(0));
}
export async function enableDevicePush(publicKey, api) {
 if(!pushSupported())throw Error('이 기기에서는 알림을 사용할 수 없습니다. iPhone에서는 홈 화면에 앱을 추가한 뒤 실행해 주세요.');
 if(!publicKey)throw Error('알림 서비스 준비 중입니다. 잠시 후 다시 시도해 주세요.');
 // Permission must be requested directly from the user's toggle gesture.
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw Error('기기 설정에서 이 앱의 알림 권한을 허용해 주세요.');
 const worker=await registration();
 const sub=await worker.pushManager.getSubscription() || await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(publicKey)});
 await api.subscribePush(sub.toJSON());return sub;
}
export async function syncDevicePush(api) {
 if(!pushSupported() || Notification.permission!=='granted')return;
 const worker=await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
 const sub=await worker?.pushManager.getSubscription();
 if(sub)await api.subscribePush(sub.toJSON());
}
export async function detachDevicePush(api) {
 if(!pushSupported())return;
 const worker=await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
 const sub=await worker?.pushManager.getSubscription();
 if(sub){try{await api.unsubscribePush(sub.endpoint);}finally{await sub.unsubscribe();}}
}
