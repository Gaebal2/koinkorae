// Policy imported from the points/levels workbook, with explicit balance adjustments.
export const POINTS_POLICY = {
  version:1, welcome:100, attendance:20, missionReward:100,
  mission:{posts:3,games:5,comments:5}, minimumGameSeconds:10,
  costs:{posts:10,reposts:10,pins:10,comments:2,likes:0,messages:0,following:0,battle:0},
  streaks:{10:100,30:500,100:3000,365:10000},
  levels:[
    {name:'새우',days:0,bp:0,posts:0,reposts:0,games:0,likes:0,bonus:0,pins:3,avatar:'새우 아이콘',cover:'기본색',friends:3,dm:3,images:0},
    {name:'게',days:7,bp:300,posts:3,reposts:1,games:20,likes:5,bonus:5,pins:3,avatar:'게 아이콘',cover:'기본색',friends:10,dm:10,images:1},
    {name:'오징어',days:30,bp:1000,posts:10,reposts:5,games:100,likes:20,bonus:10,pins:3,avatar:'오징어 아이콘',cover:'기본색',friends:20,dm:20,images:1},
    {name:'문어',days:60,bp:3000,posts:30,reposts:15,games:200,likes:50,bonus:20,pins:3,avatar:'문어 아이콘 또는 이미지 + 뱃지',cover:'이미지',friends:50,dm:50,images:2},
    {name:'돌고래',days:100,bp:10000,posts:80,reposts:40,games:400,likes:200,bonus:30,pins:3,avatar:'돌고래 아이콘 또는 이미지 + 뱃지',cover:'이미지',friends:100,dm:100,images:3},
    {name:'상어',days:200,bp:30000,posts:200,reposts:100,games:1000,likes:500,bonus:50,pins:3,avatar:'상어 아이콘 또는 이미지 + 뱃지',cover:'이미지',friends:null,dm:null,images:3},
    {name:'고래',days:365,bp:100000,posts:500,reposts:250,games:2000,likes:2000,bonus:100,pins:5,avatar:'황금 고래 아이콘 또는 이미지 + 뱃지',cover:'이미지',friends:null,dm:null,images:5},
  ],
};
export const POINT_ROWS = [
 ['가입 축하',100,'계정당 최초 1회. 기존 회원도 정책 적용 시 1회 지급'],
 ['출석',20,'한국 시간 하루 1회 + 출석 직전 등급의 추가 KK'],
 ['10일 연속 출석',100,'10일 달성 당일 추가 지급'],['30일 연속 출석',500,'30일 달성 당일 추가 지급'],
 ['100일 연속 출석',3000,'100일 달성 당일 추가 지급'],['365일 연속 출석',10000,'365일 보상 후 다음 출석부터 새 주기 시작'],
 ['일일 미션',100,'피드 3개 + 배틀 5회 + 댓글 5개 모두 완료. 하루 1회 자동 지급'],
 ['광고 시청',10,'준비 중 · 광고 검증 연동 전에는 지급하지 않음'],
 ['7일 연속 미출석',0,'차감 없음. 연속 출석만 초기화'],['30일 연속 미출석',0,'차감 없음. 보유·누적 KK 유지'],
 ['피드 작성',-10,'새 피드 등록 시'],['리포스트',-10,'동일 원문은 최초 리포스트 1회만 차감'],
 ['피드 점수 반영 (배틀)',0,'지지·반대 배틀 무료. 게임 점수는 KK와 별개'],['마커 생성',-10,'새 마커 생성 시. 수정은 무료'],
 ['마커 활성화 시간 연장',-10,'준비 중 · 현재 마커에는 만료 시간이 없음'],
 ['댓글 작성',-2,'새 댓글 등록 시'],['좋아요 / 싫어요',0,'좋아요 무료 · 싫어요 기능은 준비 중'],
 ['DM 보내기',0,'맞팔친구에게 무료'],['친구 요청 (팔로우)',0,'팔로우·취소 무료'],
];
const number=value=>Math.max(0,Number(value)||0);
export function levelFor(balance={}) {
 const stats=balance.stats||{},values={days:number(stats.days),bp:number(balance.lifetime),posts:number(stats.posts),reposts:number(stats.reposts),games:number(stats.games),likes:number(stats.likes)};
 let index=0;
 POINTS_POLICY.levels.forEach((level,i)=>{if(Object.keys(values).every(key=>values[key]>=level[key]))index=i;});
 // Earned ranks are permanent even when content is later removed.
 index=Math.max(index,Math.min(POINTS_POLICY.levels.length-1,number(balance.level)));
 const current=POINTS_POLICY.levels[index],next=POINTS_POLICY.levels[index+1]||null;
 const requirements=next?Object.entries(values).map(([key,value])=>({key,value,required:next[key],remaining:Math.max(0,next[key]-value)})):[];
 const progress=next?Math.min(...requirements.map(r=>r.required?Math.min(100,r.value/r.required*100):100)):100;
 return {index,current,next,requirements,progress};
}
