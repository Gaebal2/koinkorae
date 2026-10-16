export function isAdministrator(identity) {
 return identity?.emailVerified===true && identity.email?.toLowerCase()==='gaebal2017@gmail.com';
}
export function reportTarget(args) {
 if(!['posts','pins'].includes(args.kind) || typeof args.id!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(args.id))throw Error('신고할 항목을 확인해 주세요.');
 return {kind:args.kind,id:args.id};
}
export function requireAdministrator(identity) {
 if(!isAdministrator(identity))throw Object.assign(Error('관리자만 사용할 수 있습니다.'),{status:403});
}
