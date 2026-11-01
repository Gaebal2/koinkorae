# SwithPi / Pi 메인넷 인증

코인고래 저장소만 수정했다. PSL Mining 프로젝트와 서버 설정은 변경하지 않는다. 별도 유료 서비스, 예약 실행, 자동 송금은 생성하지 않는다.

## 구현

- 하단 `연습` 대신 `스윗파이`, 전용 24px 선형 낙하산/Pi 선물 SVG.
- 피드 배틀의 지지/반대 아래 회색 `연습하기`로 기존 연습 화면 진입.
- 내 프로필 이름·소개 오른쪽 인증 버튼. 인증 완료 시 파란 체크, 본인만 보는 지갑/인증일/Google 계정 정보와 SASEUL 수령 주소 카드.
- PSL Mining의 Muxed 자기 송금 방식과 지급 주소 체크섬 검증을 코인고래에 이식. 네트워크는 mainnet 고정. 인증 거래 3.14 Pi는 같은 기본 계정으로 돌아오며 사용자가 네트워크 수수료를 부담한다. 사용자의 서명·송금은 Pi Wallet에서 직접 진행한다. 개인키나 비밀문구를 수집하지 않는다.
- 서버가 Firebase Google 로그인 JWT, 인증 요청 소유자/로그인 시각, 10분 만료, 발신자, native 자산, 정확한 금액, Muxed ID, 거래 성공과 시각을 검증한다. 인증 재요청 간격 30초, 거래 확인 간격 5초, 최대 1,000개 거래만 조회한다.
- 이미 다른 계정이 인증한 지갑은 덮어쓰지 않는다. 이 버전에는 계정 간 소유권 이전/지갑 교체가 없다.
- SASEUL 주소는 PSL Mining과 동일하게 40자리 hex 본문을 텍스트로 두 번 SHA-256 처리한 앞 4자리 체크섬을 검증한다. 주소 저장 자체는 소유권 인증이 아니다.
- 신청 시 Pi/PSL 주소 고정. 이벤트 행 잠금과 고유 제약으로 서버 접수 순서·중복 신청을 보장한다. Google 이메일 및 인증 정보는 공개 프로필/공개 피드에 포함하지 않는다.
- 새 UI 한국어/영어 제공. 기존 다른 언어에서는 기존 번역을 우선하고 신규 문구는 영어로 대체한다.

## 배포 순서

1. 기존 운영 요금제와 무료 사용량을 확인한다. 이 변경을 위해 유료 전환하지 않는다.
2. `supabase/migrations/202611020001_swithpi.sql`을 코인고래 DB에 **한 번** 적용한다. 기존 migration 전체를 재실행하지 않는다. 기존 데이터는 변경하지 않는다.
3. `swithpi` Edge Function 배포. `supabase/config.toml`의 `verify_jwt=false`는 Firebase JWT를 함수 안에서 검증하기 위한 설정이다. 기존 `FIREBASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 사용한다. 서비스 키를 프런트엔드에 넣지 않는다.
4. CLI가 없으면 `node scripts/bundle-edge.mjs`로 `.runtime/supabase-migration/swithpi/index.ts`를 생성해 기존 서버 배포 방식으로 올린다.
5. 공개 events 요청, 미인증 status 요청의 401, 본인 정보 분리, 실제 본인 지갑의 인증 완료를 검증한다. 실제 메인넷 송금은 사용자가 진행한다.
6. 프런트엔드 배포. 서버가 미배포된 상태에서는 이벤트 안내만 표시하고 신청은 비활성화한다.

로컬 빌드/테스트 통과는 운영 배포나 메인넷 거래 성공을 의미하지 않는다. 배포 및 실제 거래 검증은 별도다.

## PSL 이벤트

- 신청 마감/스냅샷: **2026-12-25 00:00:00 Asia/Seoul** = `2026-12-24T15:00:00.000Z`.
- 해당 시각 이하로 닫힌 마지막 원장(다음 원장은 해당 시각 이후)을 기준으로 한다.
- 잔액: native Pi 계정 잔액 + 같은 원장에 존재하는 지갑 귀속 native 락업 잔액. 아직 메인넷으로 이전되지 않은 채굴 앱 잔액은 포함하지 않는다.
- 계정 잔액에는 준비금도 포함하며, 수수료 또는 준비금을 임의 차감하지 않는다. 이미 해제되어 계정 잔액에 들어온 락업은 다시 더하지 않는다.
- 1 Pi = 1 PSL, 총 100,000,000 PSL. 서버 접수 sequence 순으로 배정. 마지막 신청자는 잔여량만, 이후 신청자는 0. 소수점 7자리 정수 단위 계산.
- 지급일 미정. 배정과 지급 완료를 구분한다. 실제 SASEUL 송금은 구현하거나 실행하지 않았다.

## 정확한 시점의 스냅샷 입력과 배정

**과거 상태를 제공하는 메인넷 원장 자료 확보가 운영 전 남은 작업이다.** 공개 Horizon의 현재 account/claimable balance 조회를 12월 25일 상태인 것처럼 저장하지 않는다. 이 코드에는 과거 잔액 제공 서비스나 12월 25일 자동 실행 작업이 연결되어 있지 않다. 유료 API를 임의 도입하지 않았다. 대상 원장의 native 계정 잔액 및 락업 원장 상태를 확보한 후 아래 도구로 검증·배정한다. 파일의 ledgerHash/시각 검사는 형식과 경계 검증이지 원장 자료의 진위 검증을 대신하지 않는다.

관리자 환경에서 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 환경변수로 전달한다. 값은 명령 인자/커밋/로그에 넣지 않는다. 지갑 목록과 결과는 gitignored `.runtime` 아래에 보관한다.

```powershell
node scripts/psl-snapshot.mjs export .runtime/psl-applicants.json
node scripts/psl-snapshot.mjs prepare .runtime/psl-applicants.json .runtime/pi-historical-snapshot.json .runtime/psl-reviewed.json
# 원장 증거 및 배정 결과 검토 후, 스냅샷 시각이 지난 다음 실행
node scripts/psl-snapshot.mjs finalize .runtime/psl-reviewed.json
```

입력 JSON 형식(예시의 주소/해시는 실제 자료로 대체):

```json
{
  "network": "mainnet",
  "snapshotAt": "2026-12-24T15:00:00.000Z",
  "ledger": 123,
  "ledgerHash": "64자리 실제 원장 해시",
  "closedAt": "2026-12-24T15:00:00.000Z",
  "nextClosedAt": "2026-12-24T15:00:05.000Z",
  "accounts": [{
    "address": "인증된 G 주소",
    "balance": "100.0000000",
    "lockups": [{"id":"원장 claimable balance ID","asset":"native","amount":"200.0000000","claimants":["인증된 G 주소"]}]
  }]
}
```

신청자 전원의 기록이 필요하며 잔액 0도 명시한다. 한 락업 ID 중복, 복수 청구자, 없는 계정, 다른 네트워크, 기준 시각을 넘은 원장은 거절한다. 복수 청구자 락업은 소유 귀속을 검토해 입력 규칙을 확장해야 하며 임의로 0원 또는 중복 지급하지 않는다. SQL은 누락/중복 신청자 입력을 거절하고 원장 증거 저장·배정을 한 트랜잭션으로 처리한다. 클라이언트가 전달한 배정액을 신뢰하지 않고 DB에서 순서대로 한도를 다시 적용한다. 확정 스냅샷은 재실행으로 덮어쓸 수 없다.

현재 실시간 잔액으로 지급 예상액을 보여주지 않는다. 이는 스냅샷 보유량과 다를 수 있으며 선착순 한도로 실제 배정량도 달라진다.
