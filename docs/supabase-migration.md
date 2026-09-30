# Supabase DB 이전

대상: `https://cxvznpfcmorysnwwmbna.supabase.co`.

Firebase Authentication은 유지하고 DB·배틀 서버를 Supabase로 이전한다. 회원 ID와 기존 Google/이메일 로그인을 유지하므로 비밀번호 이전이나 계정 재가입이 필요 없다.

## 2026-09-28 적용 결과

- 운영 이전 완료: 프로필 2, 핀 2, 게시물 8, 잔액 1, 댓글 11 — 총 24건. 모든 문서 필드를 SQL로 비교했고 불일치는 0건이었다.
- 기존 Firestore는 `firebase.readonly.json` 설정으로 읽기 전용 전환했다. 원본과 로컬 백업을 보존했다.
- 실제 API에서 임시 계정으로 프로필·핀·게시물·댓글·리포스트·출석 중복 방지·배틀 검증 및 중복 완료를 확인했다. 테스트 계정과 테스트 DB 행은 정리했다.
- 로컬 45개 테스트, 빌드, GitHub Actions 테스트·Pages 배포 성공. 운영 브라우저에서 기존 피드와 지도 핀 2개 표시를 확인했다.
- 스키마는 SQL Editor/Management API로 적용했다. 이후 CLI migration push를 도입할 때 최초 버전의 적용 이력을 먼저 맞춰야 한다.

## 구성

- `src/data.js`: 기본값은 Supabase. 명시적인 `VITE_DATA_BACKEND=firebase`는 통제된 롤백용이다.
- `korae_documents`: 기존 문서 ID·하위 컬렉션·소유자를 보존하는 Postgres 테이블. 이미지 data URL도 손실 없이 이전한다.
- RLS 활성화, anon/authenticated 직접 접근 불허. `community` Edge Function만 서비스 역할로 접근한다.
- Edge Function은 Firebase JWT의 서명(RS256), issuer, audience, 만료, 발행 시각과 인증 시각을 검증한다. 요청 본문의 사용자 ID를 인증 근거로 사용하지 않는다.
- 프로필·핀·피드·댓글·팔로우·리포스트·출석을 새 DB에서 처리한다. 배틀은 서버에서 입력 기록을 재생하고 점수를 계산한다. 중복 완료는 한 번만 반영한다.
- 출석은 서버의 한국 시간 날짜를 사용한다. 사용자 단위 트랜잭션 잠금으로 중복 지급과 PIN 3개 초과 생성을 막는다.
- 화면 조회 방식은 아래 2026-09-30 구현으로 대체했다. 새 SQL과 Edge Function을 배포한 뒤 프런트엔드를 배포해야 한다.
- 기존 정책 유지: 배틀 무료, PIN 3개 무료. BP 차감·등급별 유료 PIN 정책을 임의로 도입하지 않는다.
- 광고 제공업체 미연결 상태이므로 광고 보상은 활성화하지 않는다.

## 적용 순서

1. `npm test`, `npm run build`.
2. `supabase/migrations/202609280001_community.sql` 적용.
3. `npx supabase functions deploy community --project-ref cxvznpfcmorysnwwmbna`.
4. Firebase CLI 로그인 후 `FIREBASE_TOOLS_DIR`를 설치 경로로 지정하고 `node scripts/export-firestore.cjs`. 백업은 Git에서 제외되는 `.runtime/supabase-migration`에 저장한다.
5. 전환 직전 기존 Firestore 쓰기를 차단하고 다시 내보낸다. 원본은 삭제하지 않는다.
6. CLI 로그인 권한으로 다음을 실행한다. 키를 추출하지 않아도 된다.
   - `npx supabase db query --linked --project-ref cxvznpfcmorysnwwmbna --file .runtime/supabase-migration/import.sql`
   - `npx supabase db query --linked --project-ref cxvznpfcmorysnwwmbna --file .runtime/supabase-migration/verify.sql`
   - `mismatches=0`을 확인한다. 이미 이전한 문서를 덮어쓰지 않는다.
7. 인증 없는 공개 조회, 로그인 없는 쓰기 거부, 로그인한 사용자의 출석·배틀·소유권 검증.
8. GitHub Actions 변수 `DATA_BACKEND=supabase`, `SUPABASE_URL` 적용 후 Pages 배포. 필요시 공개 `SUPABASE_PUBLISHABLE_KEY`도 지정한다.
9. 로컬 `.env.local`에도 `VITE_DATA_BACKEND=supabase` 지정.

CLI 인증이 없으면 `npx supabase login`을 먼저 실행한다. 브라우저 대시보드 배포용 단일 파일은 `node scripts/bundle-edge.mjs`로 만든다.

## 롤백

전환 이후 새 쓰기가 생겼다면 먼저 Supabase 데이터를 백업·역이전해야 한다. 단순히 이전 Firebase DB로 전환하면 새 데이터가 화면에서 사라진다. 데이터 차이를 정리한 뒤 기존 `firestore.rules`와 `DATA_BACKEND=firebase`로 복귀한다.

## 2026-09-30 조회 최적화 구현

- 메모리: 동일 요청·구독 공유, 일반 조회 5분 캐시, 쓰기 및 변경 신호 수신 시 무효화. 잔액·메시지 응답에는 TTL 캐시를 사용하지 않는다.
- IndexedDB: 공개 프로필·Pin·목록 응답을 계정별로 구분해 최대 100개/24시간 보관한다. 먼저 이전 화면을 복원하고 온라인 결과로 갱신한다. 토큰·잔액·채팅·본인 댓글 모음은 저장하지 않으며 계정 전환 시 이전 계정 저장분을 정리한다. 저장 실패는 온라인 이용을 막지 않는다.
- 화면: 조회한 페이지·코인 펼침 상태·홈 스크롤을 메모리에서 복원하고, 필터·지도 위치는 sessionStorage에서 복원한다. 화면 자체를 숨겨 계속 구독하는 방식 대신 조회 상태를 보존하고 구독은 해제한다.
- 타이밍: 검색 입력과 지도 이동은 300ms 디바운스, 연속 변경 알림은 150ms 간격으로 합친다.
- 페이지: 피드·코인 집계·작성자 피드·리포스트·지도 Pin·댓글·내 댓글을 기본 20개 커서로 조회한다. 점수/시각/ID로 동점을 구분한다. 코인 합계와 순위는 현재 로딩된 20개가 아닌 전체 필터 결과에서 서버가 계산한다.
- SQL: 목록에 작성자 정보·댓글 수·리포스트 상태를 JOIN/집계해 포함한다. 사용자/댓글 수 일괄 API, 친구 JOIN, 작성자 일괄 조회를 사용한다. 지도 마커 응답에는 사진·설명을 보내지 않고 카드 선택 시 상세를 요청한다. 범위·소유자 조건과 컬럼 projection을 적용한다.
- Push: `korae_documents` 트리거가 Supabase Realtime의 **비공개 Broadcast 채널**에 변경 종류를 보낸다. Edge Function은 Firebase JWT로 본인을 확인하고 서버 자격으로 공개 변경 채널과 본인 채널만 구독한다. 브라우저에는 SSE로 신호만 전달하며 DB 직접 읽기 권한은 열지 않는다. 잔액·채팅 본문은 Broadcast하지 않는다.
- 일반 DB 조회 폴링은 제거했다. 스트림 heartbeat는 DB 조회를 하지 않는다. 백그라운드에서는 연결을 끊고, 복귀·재접속 시 누락 가능성을 보정하기 위해 활성 조회를 갱신한다. Edge 실행 수명에 맞춰 약 120초마다 연결을 교체하며 오류 시 1~30초 backoff로 **연결만** 재시도한다.
- Firebase 롤백 어댑터와 사용하지 않는 구형 `src/app.jsx`는 이번 Supabase 변경의 적용 대상이 아니다.

### 배포 순서

1. `npm test`, `npm run build`, `node scripts/bundle-edge.mjs` 실행.
2. 운영 DB에서 `supabase/migrations/202609300001_read_optimization.sql`을 한 번 적용한다. 기존 두 migration 이후에 적용하며 이전 migration을 다시 실행하지 않는다. 기존 데이터를 지우거나 공개 RLS 읽기 권한을 추가하지 않는다.
3. `community` Edge Function을 배포한다. `stream.ts`가 포함되어야 하며 단일 파일 배포 시 위 번들 결과를 사용한다. Firebase JWT는 함수 내부에서 검증하므로 기존 `verify_jwt=false` 구성을 유지한다.
4. 공개 `page`, `profiles`, `commentCounts` 요청 및 인증된 `subscribe` 스트림의 `ready` 수신을 확인한다. 두 세션으로 게시물·댓글 변경 반영과 다른 사용자의 잔액/채팅 신호가 전달되지 않는 것을 확인한다.
5. 프런트엔드를 배포한다. SQL/서버보다 먼저 새 프런트엔드를 배포하면 새 API를 호출할 수 없다.

로컬 SQL 테스트는 PGlite에서 실제 migration과 쿼리를 실행하며, `realtime.send`만 기록용 함수로 대체한다. 운영 Supabase Broadcast 전달 자체는 배포 후 별도 검증 대상이다. 비용 절감률은 운영 요청 수/DB 사용량을 비교해 측정해야 한다.

### 운영 서버 적용 기록 (2026-09-30)

- `202609300001_read_optimization.sql` 및 `community` 서버 배포 완료.
- 운영 API: 피드 11개, 코인 그룹 4개, Pin 4개 조회 성공. 사용자/댓글 수 일괄 API 성공 및 비로그인 잔액 조회 401 확인.
- 운영 Realtime 비공개 채널 구독 전 서비스 역할 토큰을 명시적으로 설정하도록 보완했다. SSE `ready`와 DB `realtime.send` 진단 신호의 실제 수신을 확인했다. 기존 게시물·댓글·계정 데이터는 변경하지 않았다.
- 프런트엔드는 이 변경이 포함된 `main` 푸시로 GitHub Pages 워크플로가 배포한다.

참고: [Supabase Database Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization).
