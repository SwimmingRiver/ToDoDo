# 모바일 Sentry 오류 모니터링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱에 웹과 같은 수준의 Sentry 오류 보고(운영 전용·allowlist 스크러빙·uid·ErrorBoundary·삼켜진 실패 보고·소스맵)를 붙인다.

**Architecture:** `mobile/src/shared/lib/sentry.ts`가 init·스크러빙·`reportError` 헬퍼를 소유한다(웹 `client/src/shared/lib/sentry.ts`와 같은 규칙, 코드 공유 없음). `App.tsx`가 가장 먼저 `initSentry()`를 부르고 루트를 앱 자체 ErrorBoundary로 감싼다. 흩어진 `console.warn/error` 보고 지점은 `reportError`로 바꾼다.

**Tech Stack:** Expo SDK 57, React Native 0.86, `@sentry/react-native`(Expo 설정 플러그인 `@sentry/react-native/expo`, `getSentryExpoConfig`), jest-expo.

**Spec:** `docs/superpowers/specs/2026-11-22-mobile-sentry-design.md`

## Global Constraints

- 코드 작성 전 `mobile/AGENTS.md` 지시대로 Expo v57 문서(https://docs.expo.dev/versions/v57.0.0/)와 Sentry React Native Expo 가이드 확인.
- 설치는 `cd mobile && npx expo install @sentry/react-native`(Expo 57 호환 버전 고정).
- 활성 조건: `process.env.EXPO_PUBLIC_SENTRY_DSN`이 있고 `!__DEV__`일 때만 `Sentry.init`. 아니면 아무것도 안 함.
- `sendDefaultPii: false`. 성능 추적·리플레이·프로파일링 옵션은 켜지 않는다(`tracesSampleRate` 등 지정 안 함).
- 사용자는 `{ id: uid }`만. 이메일·이름 금지.
- contexts 허용: `os`, `app`, `react`만. `device` 제외.
- breadcrumb 허용 카테고리: `navigation`, `fetch`, `xhr`. data 허용 키: `url`, `method`, `status_code`, `from`, `to`, `request_body_size`, `response_body_size`. 문자열 값은 쿼리스트링 제거. message 제외.
- Sentry 조직 `none-72`, 프로젝트 `tododo-mobile`(app.json 플러그인 설정, 비밀 아님). `SENTRY_AUTH_TOKEN`은 코드·저장소에 넣지 않는다.
- `metro.config.js`의 기존 firebase `blockList`·`extraNodeModules`는 그대로 유지.
- 커밋 시 hooks 우회(`--no-verify` 등) 금지.
- 주석·커밋 메시지는 한국어(기존 컨벤션).

## Review Focus

1. DSN 없음/`__DEV__`(로컬·jest)에서 `reportError`가 던지지 않고 `console.warn`은 그대로 남아야 함 → Task 1 테스트.
2. 할 일 화면에서 렌더 오류가 나면 앱이 꺼지지 않고 대체 화면 → "다시 시도"로 복구, 다시 터져도 대체 화면이 다시 떠야 함(무한 크래시 없음) → Task 2 테스트.
3. 로그아웃 후 이벤트에 이전 uid가 남지 않아야 함(`setUser(null)`) → Task 2 테스트.
4. Sentry 플러그인 추가 후에도 Metro가 firebase 2벌을 만들지 않아야 함(blockList 유지) → Task 1 검증 스텝.
5. 사용자 취소·무료 잠금 등 예상된 실패는 보고되지 않아야 함(노이즈) → Task 3에서 기존 필터 유지 확인.

---

### Task 1: SDK 설치·설정 + `sentry.ts`(스크러빙·init·reportError)

**Files:**
- Modify: `mobile/package.json`, `mobile/package-lock.json` (expo install)
- Modify: `mobile/app.json` — plugins에 `["@sentry/react-native/expo", { "organization": "none-72", "project": "tododo-mobile" }]` 추가 (가이드가 `url` 등 필수 키를 요구하면 따름)
- Modify: `mobile/metro.config.js` — `getDefaultConfig` → `getSentryExpoConfig(__dirname)`(`@sentry/react-native/metro`), 나머지 그대로
- Modify: `mobile/jest.setup.js` — `@sentry/react-native` 전역 목
- Create: `mobile/src/shared/lib/sentry.ts`
- Test: `mobile/src/shared/lib/__tests__/sentry.test.ts`

**Interfaces:**
- Produces:
  - `scrubEvent(event: ErrorEvent): ErrorEvent`
  - `initSentry(): void`
  - `reportError(error: unknown, feature?: SentryFeature): void`
  - `type SentryFeature = "iap" | "aiPlan" | "entitlement" | "calendar" | "maintenance" | "auth"`
  - jest 전역 목: `init`, `captureException`, `setUser`는 `jest.fn()`, `wrap: (c) => c`. 각 테스트는 `jest.requireMock("@sentry/react-native")`로 꺼내 단언한다.

- [ ] **Step 1: 설치·설정** — expo install, app.json 플러그인, metro 교체, jest.setup.js 목 추가.

- [ ] **Step 2: Metro 설정 검증**

Run: `cd mobile && node -e "const c=require('./metro.config.js'); console.log(c.resolver.blockList.some(r=>String(r).includes('packages/core/node_modules/firebase')), !!c.resolver.extraNodeModules.firebase)"`
Expected: `true true`

- [ ] **Step 3: 실패하는 테스트 작성** (`sentry.test.ts`, 웹 `client/src/shared/lib/__tests__/sentry.test.ts` 구성 참고)

```ts
describe("scrubEvent", () => {
  it("허용 필드만 남기고 extra·user.email·contexts.device는 버린다", () => {
    const out = scrubEvent({
      type: undefined, event_id: "e1", message: "m", level: "error", release: "r", dist: "1",
      exception: { values: [{ type: "Error", value: "boom" }] },
      extra: { todo: { title: "비밀" } },
      user: { id: "u1", email: "a@b.c" },
      contexts: { os: { name: "iOS" }, app: { app_version: "1.0.0" }, device: { model: "iPhone18,1" }, todo: { title: "비밀" } },
    } as ErrorEvent);
    expect(out.extra).toBeUndefined();
    expect(out.user).toEqual({ id: "u1" });
    expect(out.contexts).toEqual({ os: { name: "iOS" }, app: { app_version: "1.0.0" }, react: undefined });
    expect(out.release).toBe("r");
    expect(out.dist).toBe("1");
    expect(JSON.stringify(out)).not.toContain("비밀");
  });

  it("breadcrumb은 navigation/fetch/xhr만, url 쿼리 제거, message 제거", () => {
    const out = scrubEvent({ breadcrumbs: [
      { category: "fetch", message: "x", data: { url: "https://a.dev/p?token=1", method: "POST", body: "비밀" } },
      { category: "touch", message: "할 일 제목" },
      { category: "console", message: "비밀" },
      { category: "navigation", data: { from: "Home", to: "TodoDetail" } },
    ] } as ErrorEvent);
    expect(out.breadcrumbs).toHaveLength(2);
    expect(out.breadcrumbs?.[0]).toMatchObject({ category: "fetch", data: { url: "https://a.dev/p", method: "POST" } });
    expect(out.breadcrumbs?.[0].message).toBeUndefined();
    expect(out.breadcrumbs?.[0].data).not.toHaveProperty("body");
  });

  it("request는 보내지 않는다", () => {
    expect(scrubEvent({ request: { url: "x", data: "비밀" } } as ErrorEvent).request).toBeUndefined();
  });
});

describe("initSentry", () => {
  it("__DEV__(jest 기본)에서는 DSN이 있어도 init하지 않는다", () => { /* EXPO_PUBLIC_SENTRY_DSN 설정 후 호출 → init 미호출 */ });
  it("DSN이 없으면 init하지 않는다", () => { /* __DEV__=false로 바꾸고 DSN 비움 → 미호출 */ });
  it("운영+DSN이면 sendDefaultPii:false, beforeSend가 scrubEvent 결과를 돌려준다", () => { /* init 인자 단언 */ });
});

describe("reportError", () => {
  it("console.warn을 남기고 feature 태그로 captureException한다", () => {
    reportError(new Error("x"), "iap");
    expect(console.warn).toHaveBeenCalledWith("[iap]", expect.any(Error));
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { feature: "iap" } });
  });
  it("feature가 없으면 tags 없이 보고한다", () => { /* captureException(err, undefined) 또는 tags 없음 */ });
  it("captureException이 던져도 reportError는 던지지 않는다", () => { /* mockImplementation(() => { throw }) */ });
});
```

`__DEV__` 전환은 `(global as any).__DEV__ = false`를 각 테스트에서 설정·복원. env는 `process.env.EXPO_PUBLIC_SENTRY_DSN`을 설정 후 `jest.isolateModules`로 모듈을 다시 불러와도 되고, `initSentry` 안에서 env를 호출 시점에 읽게 해도 된다(후자 권장).

- [ ] **Step 4: 실패 확인** — Run: `cd mobile && npx jest src/shared/lib/__tests__/sentry.test.ts` → FAIL(모듈 없음)

- [ ] **Step 5: `sentry.ts` 구현** — 웹 `scrubEvent`/`scrubBreadcrumb`/`stripQueryString` 구조를 따르되 위 Global Constraints의 허용 목록 사용(`dist` 추가, `request` 없음, contexts는 `os`·`app`·`react`). `isWebViewBridgeNoise`는 가져오지 않는다(웹 전용). 파일 상단 주석에 웹과의 차이(device 제외 이유=개인정보처리방침 "브라우저·OS", request 없음)와 "네이티브 크래시는 beforeSend를 거치지 않음" 한계를 적는다. `reportError`의 로그 접두사는 `[${feature}]`, feature 없으면 `"[error]"`. `captureException` 호출은 try/catch로 감싼다.

- [ ] **Step 6: 통과 확인** — Run: `cd mobile && npx jest src/shared/lib && npx tsc --noEmit` → PASS, 타입 에러 없음

- [ ] **Step 7: 커밋** — `feat(mobile): Sentry SDK 설정과 allowlist 스크러빙·reportError 헬퍼`

---

### Task 2: 앱 진입 배선 — init·ErrorBoundary·사용자 uid

**Files:**
- Modify: `mobile/App.tsx` — `import "./src/firebase"` 다음 줄 전에 `initSentry()` 호출(모듈 최상단, 다른 초기화보다 먼저). `export default Sentry.wrap(App)`. 루트 트리를 `AppErrorBoundary`로 감싼다(`SafeAreaProvider` 안쪽, `QueryClientProvider` 바깥).
- Create: `mobile/src/shared/ui/errorBoundary/AppErrorBoundary.tsx`
- Test: `mobile/src/shared/ui/errorBoundary/__tests__/AppErrorBoundary.test.tsx`
- Modify: `mobile/src/auth/useAuthState.ts` — `onAuthStateChanged` 콜백에서 `Sentry.setUser(nextUser ? { id: nextUser.uid } : null)`
- Test: `mobile/src/auth/__tests__/useAuthState.test.tsx` (케이스 추가)

**Interfaces:**
- Consumes: Task 1의 jest 전역 목(`captureException`, `setUser`).
- Produces: `AppErrorBoundary({ children }: { children: ReactNode })`

설계 메모: 스펙은 `Sentry.ErrorBoundary`를 적었지만 웹(`client/src/shared/ui/errorBoundary/errorBoundary.tsx`)처럼 **자체 클래스 컴포넌트 + `captureException(error, { contexts: { react: { componentStack } } })`**로 만든다 — 전역 목으로 테스트 가능하고 웹과 구조가 같다(설계자 판단). 웹과 달리 새로고침이 없으므로 "다시 시도"는 state를 초기화해 children을 다시 렌더한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// AppErrorBoundary.test.tsx
it("자식이 렌더 중 던지면 대체 화면을 보이고 componentStack과 함께 보고한다", () => {
  // Boom 컴포넌트가 throw → getByText("문제가 발생했습니다"), getByText("다시 시도")
  expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
    contexts: { react: { componentStack: expect.any(String) } },
  });
});
it("다시 시도를 누르면 자식을 다시 렌더한다", () => { /* 1회만 던지는 컴포넌트 → press → 자식 텍스트 보임 */ });
it("다시 시도 후 또 던지면 대체 화면이 다시 뜬다", () => { /* 항상 던지는 컴포넌트 → press → 대체 화면 유지, captureException 2회 */ });

// useAuthState.test.tsx 추가
it("로그인 시 uid만 setUser, 로그아웃 시 setUser(null)", async () => {
  // 콜백({ uid: "u1", email: "a@b.c" }) → setUser({ id: "u1" }); 콜백(null) → setUser(null)
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd mobile && npx jest src/shared/ui/errorBoundary src/auth` → FAIL

- [ ] **Step 3: 구현** — 대체 화면 문구: 제목 "문제가 발생했습니다", 설명 "화면을 표시하는 중 오류가 발생했습니다.\n다시 시도해 주세요.", 버튼 "다시 시도"(`shared/ui/button/Button`, variant primary). 색·여백은 `theme/colors`·`theme/spacing`, 레이아웃은 `EmptyState`와 비슷하게 가운데 정렬. `SafeAreaView`로 감싸 노치에 안 가리게.

- [ ] **Step 4: 통과 확인** — Run: `cd mobile && npx jest && npx tsc --noEmit` → 전체 PASS

- [ ] **Step 5: 커밋** — `feat(mobile): 앱 진입 시 Sentry 초기화, 루트 ErrorBoundary, 사용자 uid 연결`

---

### Task 3: 삼켜진 실패 보고 지점을 `reportError`로

**Files (Modify):**
- `mobile/src/maintenance/useStartupMaintenance.ts` (35·41·48행, feature `maintenance`, 기존 `console.error` 문구는 reportError 로그로 대체)
- `mobile/src/calendarIntegration/useSyncTodosToCalendar.ts` (37·192·225·236행), `useCalendarIntegration.ts` (59·79행), `markCalendarRevoked.ts` (20행), `components/CalendarConnectionBar.tsx` (65·94행) — feature `calendar`. 33행 "토큰 없음 → 해제로 맞춤"은 정상 복구 경로라 `console.warn` 유지.
- `mobile/src/premium/useEntitlementSync.ts` — 로컬 `reportError`를 공용 `reportError(e, "entitlement")`로, "앱에는 Sentry가 없어" 주석 삭제
- `mobile/src/premium/iap/resumePending.ts` — `reportIapError = (e) => reportError(e, "iap")`(이름은 유지해 호출부 변경 최소화), `verifyApi.ts` (56행), `purchaseClient.ts` (146행). 61행 "토큰 없는 거래 건너뜀"은 상황 로그라 `console.warn` 유지.
- `mobile/src/aiPlan/useGeneratePlan.ts` (10행, `isExpectedAiPlanError` 필터 유지), `useCreatePlanTodos.ts` (18행), `aiProxyApi.ts` (31행) — feature `aiPlan`
- `mobile/src/auth/signOut.ts` (21·27행) — feature `auth`
- 위 파일들의 "앱에는 Sentry가 없어 console.warn으로만" 류 주석 정리

기준: 웹 대응 파일이 `Sentry.captureException`하는 실패만 보고. `usePurchase.ts`의 사용자 취소(`E_USER_CANCELLED` 등)는 보고하지 않는다 — 현재 동작 확인 후 그대로 둔다. `AccountScreen`·`TodoDetailScreen`·`TodoFormScreen`의 catch는 사용자에게 Alert로 보이는 실패라 이번 범위 밖(웹도 화면 오류 메시지만).

**Interfaces:**
- Consumes: Task 1 `reportError(error, feature)`.

- [ ] **Step 1: 실패하는 테스트 추가** — 이미 테스트가 있는 모듈마다 1건씩, 실패 시 `captureException`이 해당 feature 태그로 호출되는지:
  - `premium/iap/__tests__/resumePending.test.ts`: `listUnfinished`가 reject → `captureException(err, { tags: { feature: "iap" } })`
  - `premium/__tests__/useEntitlementSync.test.tsx`: 구독 onError 호출 → feature `entitlement`
  - `maintenance/__tests__/useStartupMaintenance.test.tsx`: 스윕 실패 → feature `maintenance`
  - `calendarIntegration/__tests__/useSyncTodosToCalendar.test.tsx`: 동기화 실패 → feature `calendar`
  - `aiPlan/__tests__/aiProxyApi.test.ts`: fetch reject → feature `aiPlan`
  - `auth/__tests__/signOut.test.ts`: 구글 로그아웃 실패 → feature `auth`
  - `useGeneratePlan`의 예상 오류(무료 잠금 등)는 `captureException` 미호출 — 테스트 파일이 없으면 이 한 건만 새로 만든다.

- [ ] **Step 2: 실패 확인** — Run: `cd mobile && npx jest` → 추가한 케이스만 FAIL

- [ ] **Step 3: 각 지점 교체**

- [ ] **Step 4: 남은 지점 확인** — Run: `cd /Users/river/orca/workspaces/tododo/catfish && grep -rnE "console\.(warn|error)" mobile/src | grep -v __tests__`
Expected: 남는 건 의도적으로 유지한 2곳(useSyncTodosToCalendar 33행, purchaseClient 61행)과 `shared/lib/sentry.ts`뿐

- [ ] **Step 5: 통과 확인** — Run: `cd mobile && npx jest && npx tsc --noEmit` → 전체 PASS

- [ ] **Step 6: 커밋** — `feat(mobile): 결제·캘린더·AI 플랜·권한·정리작업 실패를 Sentry로 보고`

---

### Task 4: 문서·시뮬레이터 확인

**Files:**
- Modify: `mobile/AGENTS.md` — "오류 모니터링(Sentry)" 절: `EXPO_PUBLIC_SENTRY_DSN`은 **EAS production 환경에만**(preview·로컬엔 넣지 않음), `SENTRY_AUTH_TOKEN`은 EAS secret(소스맵 업로드), 로컬·CI에서 토큰이 없을 때 빌드 동작(가이드 확인 결과: 업로드 실패가 빌드를 막으면 `SENTRY_DISABLE_AUTO_UPLOAD=true` 안내), Sentry 프로젝트 `none-72/tododo-mobile`, 네이티브 크래시 스크러빙 한계, 새 민감 필드 추가 시 allowlist 갱신.

- [ ] **Step 1: AGENTS.md 작성**

- [ ] **Step 2: 전체 검증** — Run: `cd mobile && npx tsc --noEmit && npx jest --ci` → PASS

- [ ] **Step 3: 시뮬레이터 기동 확인(사용자와 함께)** — dev client 재빌드(`npx expo run:ios`, 네이티브 모듈 추가) → 로그인·목록·통계 탭 이동이 정상, Metro 로그에 Sentry/firebase 관련 오류 없음. `__DEV__`라 이벤트는 전송되지 않는 게 정상.

- [ ] **Step 4: 커밋** — `docs(mobile): Sentry 환경 변수와 한계 안내`
