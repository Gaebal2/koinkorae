# 지도 중심 첫 배포

## 현재 범위

- 기본 화면은 지도이며 메뉴는 지도와 프로필만 제공합니다.
- 이메일 회원가입·로그인·비밀번호 재설정, 프로필 소개·사진 수정.
- 공개 지도에 P2P 거래 정보 표시. 로그인 후 계정당 최대 3개 무료 등록, 본인 거래 수정·삭제.
- 홈·피드·배틀·체크인·BP·등급은 이번 배포에서 숨깁니다. 기존 구현은 `src/app.jsx`와 `server/`에 보관합니다.
- 앱 내부 결제·코인 전송·채팅은 구현 범위에 포함하지 않습니다. 거래 문의 링크를 등록할 수 있습니다.

## Firebase 연결

전용 Firebase 프로젝트 `koinkorae-map`과 웹 앱을 생성했습니다. Spark 무료 요금제이며 유료 결제 계정을 연결하지 않았습니다. 기본 Firestore DB는 CLI 규칙 배포 과정에서 `nam5`(미국 멀티 리전)에 자동 생성되었습니다. 서울 생성 요청은 API 미활성 상태로 실패했으며, 실제 DB 위치는 `nam5`입니다. 배포된 보안 규칙과 공개 웹 설정은 각각 `firestore.rules`, `src/firebase-config.json`에 있습니다. 환경 변수로 연결 프로젝트를 덮어쓸 수 있습니다.

다른 프로젝트로 재설정할 때의 절차입니다. 현재 프로젝트와 이메일 로그인, DB 규칙은 설정되어 있습니다.

1. 이 앱 전용 Firebase 프로젝트를 생성하고 웹 앱을 추가합니다.
2. Authentication에서 이메일/비밀번호 로그인을 활성화합니다. 승인된 도메인에 `gaebal2.github.io`와 로컬 검증용 `localhost`를 추가합니다.
3. Cloud Firestore 기본 데이터베이스를 생성하고 지역을 선택합니다.
4. `firebase deploy --only firestore:rules --project PROJECT_ID`로 보안 규칙을 배포합니다.
5. `.env.example`을 `.env.local`로 복사하고 웹 앱의 네 가지 설정을 입력합니다.
6. GitHub 저장소 Actions Variables에 `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`를 입력합니다. 생략하면 저장소의 공개 웹 설정을 사용합니다.
7. GitHub Pages 워크플로로 빌드·배포합니다. 주소는 `https://gaebal2.github.io/koinkorae/`를 유지합니다.

Firebase 웹 설정은 클라이언트에 공개되는 값입니다. 데이터 쓰기 권한은 `firestore.rules`로 제한합니다. 서비스 계정 키는 클라이언트나 저장소에 넣지 않습니다.

## 로컬 검증

```
npm install
npm test
npm run build
npm run dev
firebase emulators:exec --only firestore --project demo-koinkorae "node --test tests/firestore.test.js"
```

보안 규칙 테스트는 Java와 Firebase CLI가 필요합니다. 2026-09-15 보안 규칙 테스트 5개와 기존 테스트 25개가 통과했습니다. 실제 Firebase 회원가입·로그인·로그아웃 및 거래 생성·조회·수정·삭제 연결도 임시 계정으로 검증했습니다. 실제 스마트폰 설치 동작은 기기에서 별도 확인해야 합니다.

## Supabase 이전 경계

화면은 `src/data.js`의 `watchAuth`, `login`, `register`, `resetPassword`, `logout`, `listPins`, `savePin`, `deletePin`, `profile`, `saveProfile`만 사용합니다. UI에는 Firebase 문서 참조를 전달하지 않습니다. 이전 시 이 어댑터를 교체하고 Firestore 프로필·핀을 변환합니다. Firebase 사용자 ID와 새 인증 ID 매핑, 사용자 비밀번호 이전 또는 재설정 계획은 별도로 필요합니다.

핀 문서 ID는 `사용자ID_0`부터 `_2`까지로 제한해 동시 요청에서도 3개 제한을 지킵니다. 공개 프로필에는 이메일을 저장하지 않습니다. 사진은 최대 30만 자의 JPEG data URL로 압축하여 저장합니다. 초기 소규모 검증은 전체 핀을 조회하므로 이용량 증가 전 지도 영역 조회와 이미지 스토리지 분리가 필요합니다.

## 아이콘

기존 고래·한글 로고를 참고해 보라색 `#7157FF`, 흰색, 민트 `#BAF7D0`로 수정했습니다. 원본은 `public/koin-korae-violet-source.png`, 배포용은 192·512·180 PNG입니다. 기존 PWA ID를 유지하고 아이콘 경로와 서비스 워커 캐시 버전을 갱신했습니다.
