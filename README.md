# Koin Korae

현재 첫 서비스는 **지도·프로필·이메일 로그인**에 집중하는 위치 기반 P2P 거래 정보 PWA입니다. 호스팅은 GitHub Pages, 인증·DB는 Firebase를 사용하도록 준비했습니다. 홈·체크인·피드·배틀은 숨겨져 있습니다.

실행: `npm install` → `npm run dev`. 전용 Firebase 프로젝트 `koinkorae-map`의 공개 웹 설정이 포함되어 있습니다. 다른 프로젝트를 사용하려면 `.env.example`을 참고해 `.env.local`로 덮어쓰세요. 로컬 API 서버는 현재 지도 화면에 필요하지 않습니다.

**현재 설정·배포 방법과 Supabase 이전 구조는 [지도 중심 첫 배포](docs/map-first-release.md)를 참고하세요.** 아래 내용은 추후 확장을 위해 보관한 이전 BattleFeed 로컬 구현 설명입니다.

## 로컬 실행

Node.js **24 이상**이 필요합니다. 처음에는 등록된 회원이나 게시물이 없습니다.

```bash
npm install
```

터미널 1 — 데이터/API 서버:

```bash
npm run server
```

터미널 2 — 화면 개발 서버:

```bash
npm run dev
```

`http://localhost:5173`에서 회원가입 → 체크인 → 글 작성 → 배틀 순서로 사용할 수 있습니다. 최초 BP는 0이고 출석 시 10 BP가 지급됩니다. Windows PowerShell 실행 정책으로 npm이 차단되면 `npm.cmd`를 사용하세요.

화면은 `/api`를 `127.0.0.1:3001`로 프록시합니다. `data/battlefeed.sqlite`와 같은 디렉터리의 WAL/SHM 파일이 로컬 DB입니다. 이 경로는 Git에 포함되지 않습니다. 서버를 종료해도 데이터는 유지됩니다.

프로덕션 형태의 로컬 검증:

```bash
npm run build
npm run server
```

이 경우 `http://localhost:3001`에서 화면과 API를 함께 제공합니다.

## 검사

```bash
npm test
npm run build
npm run report
```

`report`는 로컬 DB의 BP 유입·사용, 배틀/출석 수, 게임 점수 평균·중앙값·분산, 부정행위 플래그 집계를 출력합니다. 테스트 DB는 별도 임시 경로/메모리를 사용합니다.

## MVP 기능

- 실제 회원가입·로그인, 프로필·댓글·팔로우
- 유저피드/코인피드의 공통 정렬·기간 필터
- 서버 배정 3종 게임과 점수 검증, 1 BP 차감
- 프로필 전용 리포스트와 원본 점수 동시 반영
- 핀 생성·수정·삭제, 4개 분류, 누적 BP에 따른 핀 제한
- 현지 날짜별 출석, 사용 BP/누적 BP 구분
- 설치 가능한 PWA 및 오프라인 화면 셸. 로그인·게시·BP 활동은 온라인 상태가 필요합니다.

## 미완료 외부 연동

**광고 사업자와 운영 서버는 연결하지 않았습니다.** 광고는 준비 중으로 표시되며 실제 보상을 지급하지 않습니다. 운영 환경의 PRD 전체 충족을 의미하지 않습니다.

광고 어댑터 계약과 요구사항별 구현·검증 기록은 [PRD 구현 기록](docs/PRD-implementation.md)에 있습니다.

## 운영 설정

| 환경 변수 | 기본값/설명 |
|---|---|
| `DATABASE_PATH` | `data/battlefeed.sqlite` — 지속 디스크 경로 |
| `HOST` | `127.0.0.1` — 외부 노출 시 명시적으로 설정 |
| `PORT` | `3001` |
| `APP_ORIGIN` | 로컬 주소들 — 운영에서는 허용할 화면 origin만 쉼표로 구분 |
| `NODE_ENV` | 운영에서는 `production`. 세션 쿠키에 Secure 적용하므로 HTTPS 필요 |
| `VITE_API_URL` | `/api`. 빌드 시 API 경로 지정 |
| `BATTLEFEED_CONFIG` | JSON 객체. 예: `{"checkinReward":10,"battleCost":1,"pinCost":1,"adReward":20,"adDailyLimit":3,"silver":1000,"gold":10000}` |

화면/API를 같은 사이트의 HTTPS 도메인으로 제공하는 구성을 권장합니다. 현재 쿠키는 SameSite=Lax라서 임의의 다른 사이트 API에 연결하는 방식은 지원하지 않습니다. 리버스 프록시에서 TLS와 요청 제한을 적용하고 DB 백업을 구성해야 합니다.

GitHub Pages만으로 서버를 운영할 수 없습니다. 기존 자동 배포는 저장소 변수 `BATTLEFEED_API_URL`이 설정된 경우에만 실행되도록 보호했습니다. API와 세션 구성을 완료하기 전에 운영 화면을 교체하지 마세요. 테스트/빌드 CI는 별도로 실행됩니다.
