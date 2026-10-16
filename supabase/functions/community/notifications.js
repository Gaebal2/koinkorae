export const notificationTypes = ['comment','repost','like','share','chat','checkin'];
export const defaultPreferences = Object.fromEntries(['enabled',...notificationTypes].map(key=>[key,false]));
export function preferences(value) {
 if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!Object.hasOwn(defaultPreferences,key)) || Object.values(value).some(item=>typeof item!=='boolean')) throw Error('알림 설정을 확인해 주세요.');
 return {...defaultPreferences,...value};
}
export function subscription(value) {
 if (!value || typeof value.endpoint!=='string' || value.endpoint.length>2048) throw Error('알림 구독을 확인해 주세요.');
 const url=new URL(value.endpoint);
 const allowed=url.hostname==='fcm.googleapis.com' || url.hostname==='updates.push.services.mozilla.com' || url.hostname.endsWith('.push.services.mozilla.com') || url.hostname==='web.push.apple.com' || url.hostname.endsWith('.notify.windows.com');
 if(url.protocol!=='https:' || url.port || url.username || url.password || !allowed) throw Error('지원하지 않는 알림 서버입니다.');
 if(!/^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth)) throw Error('알림 암호화 키를 확인해 주세요.');
 return {endpoint:url.href,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
export function notificationPayload(job) {
 const labels={comment:'내 피드에 새 댓글이 달렸어요.',repost:'누군가 내 피드를 리포스트했어요.',like:'내 피드에 좋아요가 도착했어요.',share:'누군가 내 피드의 공유 버튼을 눌렀어요.',chat:'맞팔 친구에게 새 메시지가 도착했어요.',checkin:'새로운 하루의 체크인이 열렸어요. KK를 받아보세요!'};
 return {title:job.kind==='checkin'?'오늘의 체크인':'ㅋㅇㄱㄹ',body:labels[job.kind]||'새 알림이 도착했어요.',tag:job.event_key,url:job.kind==='chat'?'?screen=chat':job.kind==='checkin'?'?screen=check':'?post='+encodeURIComponent(job.target)};
}
