// Convert server/transport failures to stable, localized, user-actionable messages.
export const swithpiErrorMessages = {
 account:'PSL Mining에서 같은 Google 계정을 찾지 못했습니다. 두 앱에서 같은 Google 계정을 사용해 주세요.',
 proof:'PSL Mining에서 유효한 Pi 지갑 소유권 인증을 찾지 못했습니다.',
 duplicate:'이미 다른 코인고래 계정에 연결된 인증정보입니다.',
 google:'지갑 인증은 Google 계정으로 로그인한 뒤 진행해 주세요.',
 session:'로그인이 만료되었습니다. 다시 로그인해 주세요.',
 cooldown:'30초 후 다시 시도해 주세요.',
 check:'5초 후 다시 확인해 주세요.',
 unavailable:'지갑 인증 서비스가 준비되지 않았습니다.',
 network:'서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.',
 expired:'인증 시간이 만료되었습니다. 다시 요청해 주세요.',
 address:'올바른 G로 시작하는 Pi 테스트넷 주소를 입력해 주세요.',
 psl:'SASEUL 지갑 주소의 형식과 체크섬을 확인해 주세요.',
 closed:'현재 신청 기간이 아닙니다.',
 consent:'참여 조건을 확인하고 동의해 주세요.',
 eligibility:'Pi 지갑 소유권 인증과 PSL 수령 지갑 등록이 필요합니다.',
 denied:'현재 계정으로 참여할 수 없습니다. 로그인 상태와 서비스 이용 가능 여부를 확인해 주세요.',
 fallback:'요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
};
export function swithpiErrorKey(error) {
 const message=String(error?.message||error||'');
 if(Object.values(swithpiErrorMessages).includes(message))return message;
 const rules=[[/같은 Google|Google 계정을 찾지/, 'account'],[/유효한 Pi|PSL 인증정보입니다/, 'proof'],[/이미 인증|이미 신청|다른 계정|다른 코인고래|duplicate key/,'duplicate'],[/30초/,'cooldown'],[/5초|잠시 후 다시 확인/,'check'],[/Google|구글/,'google'],[/로그인|계정이 변경/,'session'],[/준비되지|준비 중/,'unavailable'],[/만료|인증 요청|다시 요청/,'expired'],[/체크섬|SASEUL/,'psl'],[/수령 지갑|소유권 인증이 필요/,'eligibility'],[/지갑 주소|G로 시작/,'address'],[/신청 기간|마감|종료/,'closed'],[/동의|약관|참여 조건/,'consent'],[/수령 지갑|소유권 인증이 필요/,'eligibility'],[/연결|조회|확인하지 못|fetch|network|timeout|abort/i,'network']];
 for(const [pattern,key] of rules)if(pattern.test(message))return swithpiErrorMessages[key];
 return swithpiErrorMessages.fallback;
}
