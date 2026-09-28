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
- 화면 데이터는 30초마다 갱신하고 본인 쓰기 성공 직후에도 갱신한다. 댓글 수처럼 같은 데이터 구독은 이후 이용량에 따라 합칠 수 있다.
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
