# 공통 알림 팝업

`src/feedback.jsx`의 `FeedbackProvider`가 앱 전체 알림과 확인 창을 관리합니다.

- `useFeedback().notify(message, {title, kind})`: 정보·오류·성공 알림.
- `await useFeedback().confirm(message, {title, confirmLabel})`: 확인은 true, 취소·닫기·Escape는 false.
- `useAppMessage()`: 기존 오류 상태를 공통 팝업에 연결합니다.
- 브라우저 폼 `invalid` 이벤트를 처리해 기본 검증 말풍선 대신 공통 팝업을 표시합니다.
- 여러 알림은 순서대로 표시하고 동일한 대기 알림은 합칩니다.
- 팝업 뒤 콘텐츠는 inert 처리하고 포커스·스크롤을 제어합니다. 입력 오류를 닫으면 해당 입력칸으로 돌아갑니다.
- 거래·게시물 삭제 확인, 저장·게시·출석 성공, 인증·네트워크·위치·사진 오류와 설치 실패에 적용합니다.

실제 Google 계정 선택, 위치 권한, 브라우저 PWA 설치 창은 브라우저/운영체제가 제공하므로 앱 CSS로 바꾸지 않습니다. 앱에서 생성하는 안내만 공통 스타일을 사용합니다. 기본 `window.alert/confirm/prompt` 호출은 앱 코드에 없습니다.

브라우저에서 취소/확인 반환, Escape, 포커스 복귀, 입력 검증, 연속 알림 순서를 검증했습니다. Google 로그인은 제공업체 설정 완료 후 `GOOGLE_SIGNIN_ENABLED=true`로 활성화합니다. 메뉴 복원과 팝업은 그 설정과 독립적으로 배포합니다.
