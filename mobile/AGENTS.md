# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## 환경 변수 (회원 탈퇴)

계정 삭제는 세 프록시를 모두 호출한다. 아래 변수가 `mobile/.env`와 EAS 환경 양쪽에 설정돼 있어야 하며, 하나라도 비면 회원 탈퇴가 항상 실패한다.

- `EXPO_PUBLIC_CALENDAR_PROXY_URL`
- `EXPO_PUBLIC_REMINDER_PROXY_URL`
- `EXPO_PUBLIC_BILLING_PROXY_URL`

### AI 할 일 플랜

AI 할 일 플랜 화면은 `EXPO_PUBLIC_AI_PROXY_URL`도 `mobile/.env`와 EAS 환경 양쪽에 있어야 한다. 비어 있으면 「계획 만들기」가 항상 일반 오류 문구로 실패한다.

### 구글 캘린더 연동

캘린더 연결·해제·동기화도 `EXPO_PUBLIC_CALENDAR_PROXY_URL`을 쓴다(위 탈퇴용과 같은 값). 비어 있으면 연결 시작이 항상 실패한다. OAuth는 `tododo://calendar` 딥링크로 복귀하므로 `app.json`의 `"scheme": "tododo"`가 들어간 네이티브 빌드가 필요하다(scheme 추가 전 빌드로는 복귀하지 않는다).

### 오류 모니터링(Sentry)

앱 오류는 Sentry 프로젝트 `none-72/tododo-mobile`(웹 `tododo-client`와 별도)로 간다. 설정은 `src/shared/lib/sentry.ts`.

- `EXPO_PUBLIC_SENTRY_DSN`은 **EAS production 환경에만** 등록한다. preview·로컬 `.env`에는 넣지 않는다 — 비어 있으면 Sentry가 켜지지 않는다. 개발 빌드(`__DEV__`)는 DSN이 있어도 켜지지 않는다.
- `SENTRY_AUTH_TOKEN`은 EAS 환경 secret(소스맵 업로드용). 저장소·`app.json`에 넣지 않는다. 조직·프로젝트 이름은 `app.json`의 `@sentry/react-native/expo` 플러그인 설정에 있다(비밀 아님).
- 토큰이 없으면 릴리스 빌드의 소스맵 업로드 단계가 빌드를 실패시킨다. 그래서 `eas.json`의 development·simulator 프로필은 `SENTRY_DISABLE_AUTO_UPLOAD=true`다. 토큰 없이 로컬에서 릴리스 빌드할 때도 이 값을 준다.
- 보내는 필드는 허용 목록(allowlist)으로만 정한다: 오류 메시지·스택, OS·앱 버전, uid, navigation/fetch/xhr breadcrumb. 기기 모델(`contexts.device`)·할 일 내용·이메일은 보내지 않는다. 새 정보를 보내야 하면 `scrubEvent`의 허용 목록에 명시적으로 추가한다(안 하면 기본 차단).
- 한계: 네이티브(iOS/Android) 크래시는 네이티브 SDK가 다음 실행 때 직접 보내 `beforeSend`(스크러빙)를 거치지 않는다 — 기기 정보가 담길 수 있다. breadcrumb은 `beforeBreadcrumb`로 기록 시점에 걸러(RN SDK가 breadcrumb을 네이티브에도 복사하므로) 네이티브 크래시에도 허용된 것만 실린다.
- `debug_meta`(소스맵 debug id)는 지우면 스택이 압축된 번들 위치로만 보이므로 허용 목록에 있다.
- 화면을 깨지 않는 실패는 `reportError(error, feature)`로 보고한다(웹의 `Sentry.captureException` 위치와 맞춤). 사용자 취소·무료 잠금 같은 예상된 실패는 보고하지 않는다.
- `@sentry/react-native`는 네이티브 모듈이라, 추가 전 빌드한 dev client로는 실행되지 않는다 — dev client를 다시 빌드한다.
