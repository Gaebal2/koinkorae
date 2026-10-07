# 100명 시범 운영 비용 개선

## 2026-10-07 적용

무료 범위를 우선한다. 요금제 업그레이드나 유료 옵션을 신청하지 않았다.

### 사진

- 공개 프로필·핀·피드 사진은 `community-media` Storage 버킷에 저장한다. 로그인 검증 후 서버만 업로드하며 익명/일반 DB 쓰기 권한은 추가하지 않았다.
- DB에는 URL만 저장한다. SHA-256 파일명과 1년 캐시를 사용한다. 동일 내용은 같은 파일을 재사용하며 덮어쓰지 않는다.
- 기존 데이터 URL도 서버가 받아 변환하므로 기존 설치 앱과 호환된다. 저장소 오류 시 DB에 깨진 URL을 기록하지 않는다.
- 사진 26개 이전 완료. 이전 대상 프로필·핀·게시물 41건의 JSON 합계는 1,950,323 bytes → 29,231 bytes. 이는 논리 데이터 크기이며 DB 물리 디스크 감소량이나 월 청구액 절감률이 아니다.
- 파일을 공개 URL에서 다시 읽어 원본 해시와 비교한 후 원래 필드 값이 같은 경우에만 변경했다. 동시 수정 충돌 0건, 남은 인라인 사진 0개.
- 원본 백업은 Git에서 제외되는 `.runtime/media-migration/before-1791334670541.json`에 있다. 키나 인증 토큰은 백업하지 않는다.
- 피드 사진은 화면에 가까워질 때 로드한다. 원격 사진 편집은 CORS를 사용한다.
- 기존 파일은 자동 삭제하지 않는다. 삭제된 게시물/교체된 프로필의 미참조 파일 정리는 별도 검증 후 진행한다. 공유 파일을 즉시 삭제하면 다른 게시물 사진도 깨질 수 있다.

운영 명령:

```powershell
node scripts/migrate-media.mjs
node scripts/migrate-media.mjs --prepare
npx.cmd --yes supabase db query --linked --project-ref cxvznpfcmorysnwwmbna --file supabase/migrations/202610070001_media_storage.sql
npx.cmd --yes supabase functions deploy community --project-ref cxvznpfcmorysnwwmbna --use-api
node scripts/migrate-media.mjs --migrate
```

기본 실행은 사진 수·용량만 집계한다. `--prepare`는 버킷 생성, `--migrate`는 백업·업로드·검증·조건부 변환이다. CLI 인증을 메모리에서 사용하며 비밀 키를 출력하지 않는다. 재실행해도 이미 변환한 URL은 다시 이전하지 않는다.

롤백 시 URL을 읽는 호환 서버를 유지한다. 저장소 장애 복구는 백업의 필드와 현재 URL이 해당 사진의 해시를 가리키는지 비교한 뒤 필요한 필드만 복원한다. 사용자 신규 수정분을 전체 백업으로 덮어쓰지 않는다.

### 실시간 연결

- 같은 Edge 실행 환경에서는 서비스 인증 연결과 공개 채널을 공유한다. 사용자별 채널은 구독자별로 분리하고 마지막 구독이 끝나면 해제한다.
- 서로 다른 Edge 실행 환경까지 하나로 합쳐지는 것은 아니다. 실제 연결·메시지 감소량은 운영 사용량으로 확인한다.
- 무료 Edge 수명에 맞춘 120초 재연결은 유지한다. 따라서 함수 호출 수가 없어지는 개선은 아니다.
- 백그라운드 종료, 재접속 시 누락 보정, 개인 잔액·메시지 분리는 유지한다.
- 로컬 116개 테스트 통과. 운영 임시 계정으로 프로필·핀·게시물 사진 업로드/URL 재사용/캐시 헤더와 두 실시간 구독의 변경 수신 검증 완료. 임시 계정과 DB 행 정리 완료.

### 무료 호스팅 이전 준비

Cloudflare Pages: Node 24, `npm ci && npm run build`, 출력 `dist`, `VITE_BASE_PATH=/`.
`wrangler.toml`과 `public/_headers`를 준비했다. Firebase/Supabase 기본 공개 설정은 소스에 있으며 비밀 키는 프런트엔드에 넣지 않는다.
현재 운영은 GitHub Pages다. Cloudflare 계정 로그인 → 미리보기 배포 검증 → koinkorae.com 등록 및 DNS/HTTPS 검증 → 자동 배포 전환 순서로 진행한다. 루트 도메인에 Cloudflare Pages를 붙이려면 도메인을 같은 Cloudflare 계정의 DNS zone으로 관리해야 하므로 네임서버 전환이 필요하다. 가비아는 도메인 등록업체로 유지할 수 있다.

### 운영 점검

100명 가입과 100명 동시 접속을 구분한다. Supabase Usage에서 DB 용량, Storage 용량, egress, 함수 호출, Realtime 연결·메시지를 주기적으로 확인한다. 무료 한도에 가까워지면 먼저 사진·조회 사용량을 점검하며 자동 유료 전환을 전제로 하지 않는다.
