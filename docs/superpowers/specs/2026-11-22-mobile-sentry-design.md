# 모바일 앱 Sentry 오류 모니터링 — 설계 (짧은 버전)

2026-11-22 · 브랜치 `feat/mobile-sentry`

## 왜

앱은 출시 전인데 원격 오류 보고가 전혀 없다. 렌더 오류는 화면을 하얗게 만들고 끝나며(ErrorBoundary 없음),
결제·캘린더·AI 플랜 실패는 `console.warn`으로만 남아 출시 후엔 개발자가 알 길이 없다.
사용자 요구: **웹과 같은 수준**이면 된다.

## 목표 / 비목표

목표 — 웹(`client/src/shared/lib/sentry.ts`, PR #75·#171)과 같은 다섯 가지:
1. 운영 빌드에서만 켜짐(`__DEV__`면 init 안 함, DSN 없으면 조용히 비활성)
2. allowlist 스크러빙(사용자 입력이 섞일 수 있는 필드는 기본 차단), 사용자는 uid만
3. 렌더 오류를 잡는 루트 ErrorBoundary + 대체 화면
4. 앱이 죽지 않는 "삼켜진" 실패 보고 — 지금 `console.warn/error` 하는 지점(아래 목록)
5. 소스맵 업로드(EAS 빌드 시)

비목표: 성능 추적(tracing)·세션 리플레이·프로파일링(웹도 안 씀), 사용자 피드백 위젯,
EAS production 프로필·스토어 빌드 설정(Task 8에서 별도), Android 실기 확인(IAP 실측 때).

안티 목표: 할 일 제목·설명·이메일 등 사용자 입력이 Sentry로 나가는 것. 개발 중(dev client) 이벤트가 쌓이는 것.

## 접근 (사용자가 방식은 맡김 → A 선택)

- **A. `@sentry/react-native` + Expo 설정 플러그인 (선택)** — JS 오류·렌더 오류·네이티브(iOS/Android) 크래시까지,
  소스맵은 EAS 빌드 단계에서 자동 업로드. 대가: 네이티브 모듈이라 dev client 재빌드 필요.
- B. 같은 SDK에서 네이티브 끄고 JS만 — 네이티브 모듈은 어차피 링크돼 재빌드를 못 피하고 네이티브 크래시만 잃음. 제외.
- (검토 후 제외) 브라우저용 JS SDK 직접 사용 — RN 미지원·스택 해석 불가.

## 결정 사항

- **Sentry 프로젝트는 앱 전용으로 분리**: 조직 `none-72`에 `tododo-mobile`(React Native 플랫폼) 신설. 웹(`tododo-client`)과 이슈·알림이 섞이지 않게.
  "Prevent Storing of IP Addresses"는 웹과 같이 켠다(사용자 작업).
- **스크러빙은 앱에 별도 구현**(`mobile/src/shared/lib/sentry.ts`). `@tododo/core`가 Sentry 타입에 의존하지 않게 하기 위해 웹 코드를 공유하지 않는다. 규칙은 웹과 동일:
  - 허용: message, exception, fingerprint, tags, level, release, dist, environment, platform, sdk, timestamp, event_id, `user.id`
  - contexts는 `os`, `app`(앱 버전·빌드 번호), `react`(componentStack)만. **`device`(기기 모델 등)는 제외** — 개인정보처리방침이 "브라우저·OS"까지만 고지하므로(설계자 판단).
  - breadcrumbs: 웹과 같은 카테고리(`navigation`, `fetch`, `xhr`)만, data는 url(쿼리 제거)·method·status_code·from·to·body size만, message 제외. (`touch`/`console` 등은 사용자 입력이 섞일 수 있어 차단)
  - request는 앱에선 의미 없으므로 보내지 않는다.
- **사용자 식별**: `useAuthState`의 `onAuthStateChanged`에서 `Sentry.setUser(user ? { id: uid } : null)` — 웹 authProvider와 같은 위치·방식.
- **보고 헬퍼 하나로 통일**: `reportError(error, feature?)` = `console.warn` 유지 + `Sentry.captureException(error, { tags: { feature } })`.
  지금 흩어진 `console.warn/error` 보고 지점을 이 헬퍼로 바꾼다(아래). feature 태그 값은 웹과 같은 이름(`billing`→앱은 `iap`, `aiPlan`, `entitlement`, `calendar`, `maintenance`).
- **ErrorBoundary**: `App` 루트를 `Sentry.ErrorBoundary`로 감싸고 대체 화면("문제가 발생했습니다" + 다시 시도 = `resetError`) 표시. 웹처럼 componentStack은 contexts.react로만 전달.
- **활성 조건**: `EXPO_PUBLIC_SENTRY_DSN`이 있고 `!__DEV__`일 때만 init. DSN은 **EAS production 환경에만** 등록해 preview(시뮬레이터 빌드)에서는 나가지 않게 한다.
- **소스맵**: `app.json` plugins에 `@sentry/react-native/expo`(organization·project 지정, 비밀 아님), `metro.config.js`는 `getSentryExpoConfig`로 교체하되 기존 firebase blockList·extraNodeModules 유지. 업로드 토큰 `SENTRY_AUTH_TOKEN`은 EAS 환경 secret(사용자 작업). 로컬·CI(jest/tsc)에는 토큰이 없어도 실패하지 않아야 한다.

### 보고 지점 (현재 console.warn/error → reportError)

| 영역 | 파일 |
|---|---|
| 진입 시 정리 작업 | `maintenance/useStartupMaintenance.ts` (3곳) |
| 캘린더 | `calendarIntegration/useSyncTodosToCalendar.ts`, `useCalendarIntegration.ts`, `markCalendarRevoked.ts`, `components/CalendarConnectionBar.tsx` |
| 프리미엄 권한 | `premium/useEntitlementSync.ts` (`reportError`) |
| 인앱결제 | `premium/iap/resumePending.ts`(`reportIapError`), `verifyApi.ts`, `purchaseClient.ts` |
| AI 플랜 | `aiPlan/useGeneratePlan.ts`(예상 오류는 이미 제외), `useCreatePlanTodos.ts`, `aiProxyApi.ts` |
| 로그아웃 | `auth/signOut.ts`(알림 취소·구글 로그아웃 실패) |

웹에서도 보고하지 않는 "예상된" 실패(사용자 취소·무료 잠금 403·오프라인 등)는 보고하지 않는다. 경계가 애매한 곳은 구현자가 웹 대응 파일의 동작을 따른다.

## 사용자가 할 일 (코드 밖)

1. Sentry에 `tododo-mobile` 프로젝트 생성, IP 저장 방지 켜기
2. EAS production 환경에 `EXPO_PUBLIC_SENTRY_DSN`, secret `SENTRY_AUTH_TOKEN` 등록
3. dev client 재빌드(네이티브 모듈 추가)

## 알려진 한계

- **네이티브 크래시 이벤트는 JS `beforeSend`를 거치지 않는다** — 네이티브 SDK가 다음 실행 시 직접 보내며 기기 정보(device)가 포함될 수 있다. 사용자 입력은 담기지 않으므로 수용한다. 정확한 동작은 구현 시 확인하고, 필요하면 개인정보처리방침 "브라우저·OS"를 "기기·OS"로 넓히는 개정을 별도 할 일로 남긴다.
- 실제 전송·소스맵 해석 확인은 production 프로필이 생기는 Task 8 이후에야 가능하다. 이번 PR의 검증은 단위 테스트(스크러빙·헬퍼·ErrorBoundary 대체 화면) + 시뮬레이터에서 앱이 정상 기동하는지까지.

## 구현자에게 맡기는 것

- `@sentry/react-native` 버전(Expo 57 호환 — `npx expo install`로), jest 목 방식
- 대체 화면 문구·스타일(기존 디자인 토큰 사용, 다크모드 대응)
- 웹과 경계가 애매한 개별 보고 지점의 포함 여부(웹 대응 파일 기준)
