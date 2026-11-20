# 라우트 오류·404 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라우트 렌더 오류·없는 주소·청크 로드 실패를 react-router 기본 화면 대신 서비스 안 화면으로 받아 이탈을 막는다.

**Architecture:** 공용 `RouteErrorPage`(`useRouteError` 기반, `variant: "fullPage" | "inline"`)를 만들고, `router.tsx`에서 (1) 모든 최상위 라우트를 감싸는 pathless 루트 라우트에 fullPage, (2) App 셸 children을 감싸는 pathless 라우트에 inline errorElement를 단다. 없는 주소는 셸 children의 `path: "*"`로 받는다. 청크 실패는 sessionStorage 시각 기록으로 1회만 자동 새로고침한다.

**Tech Stack:** React 19, react-router-dom 7 (`createBrowserRouter`), styled-components, @sentry/react, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-11-20-route-error-page-design.md`

## Global Constraints

- 웹(`client/`)만. `server/`·`mobile/` 수정 금지.
- 기존 `main.tsx`의 `ErrorBoundary`는 유지(라우터 밖 오류용).
- `RouteErrorPage`는 router.tsx가 eager로 import한다 → auth·Firestore·`@/shared` 배럴·무거운 라이브러리 import 금지. 허용: react, react-router-dom, styled-components, `@sentry/react`, `@/styles/colors`.
- 색은 `colors` 토큰만(다크모드 자동). 버튼 배경 `brand.strong`/hover `brand.strongHover`/글자 `brand.onStrong` — 기존 errorBoundary.styles와 동일 규칙.
- 파일명 camelCase.
- 청크 재시도 키 `"tododo:chunkReloadAt"`, 창 `10_000`ms. storage 접근은 전부 try/catch, 실패 시 자동 새로고침 안 함.
- 문구(고정):
  - 404 제목 `페이지를 찾을 수 없어요`, 설명 `주소가 바뀌었거나 없는 페이지예요.`, 버튼 `홈으로`만
  - 오류 제목 `문제가 발생했어요`, 설명 `화면을 표시하는 중 오류가 생겼어요. 새로고침하거나 홈으로 이동해 주세요.`, 버튼 `새로고침`(주 버튼)·`홈으로`(보조)
- 홈 = `/` (RootGate가 로그인 여부로 분기).
- 테스트는 CI 등가로 `VITE_FIREBASE_API_KEY= npx vitest run` 로 확인. 커밋 시 hooks 우회(`--no-verify`) 금지.

## Review Focus

1. 청크 실패 후 새로고침해도 또 실패(배포 롤백 등) → 무한 새로고침 없이 두 번째엔 오류 화면. (Task 1, Task 2 테스트로 고정)
2. 비로그인 사용자의 없는 주소 → 404가 아니라 `/login`으로 이동(ProtectedRoute가 먼저 판단). (Task 3 테스트)
3. 셸 안 페이지 오류 → 셸(Outlet 바깥)은 그대로 보이고 본문 자리에만 안내. (Task 3 테스트)
4. 404는 Sentry로 보내지 않음(크롤러·오타 노이즈). (Task 2 테스트)
5. sessionStorage 접근이 throw하는 환경(사파리 프라이빗 등) → 오류 화면이 정상 렌더되고 reload 안 함. (Task 1 테스트)

---

### Task 1: 청크 로드 실패 판별·재시도 가드

**Files:**
- Create: `client/src/shared/ui/routeError/chunkReload.ts`
- Test: `client/src/shared/ui/routeError/__tests__/chunkReload.test.ts`

**Interfaces:**
- Produces:
  - `isChunkLoadError(error: unknown): boolean` — `error instanceof Error`(또는 `message` 문자열 보유)이고 메시지에 다음 중 하나 포함: `"Failed to fetch dynamically imported module"`, `"Importing a module script failed"`, `"error loading dynamically imported module"`, `"Unable to preload CSS"`.
  - `canAutoReload(now?: number): boolean` — 기록이 없거나 `now - 기록 >= 10_000`이면 true. storage throw → false.
  - `markAutoReload(now?: number): void` — 기록 저장, throw 삼킴.
  - `CHUNK_RELOAD_KEY = "tododo:chunkReloadAt"`, `CHUNK_RELOAD_WINDOW_MS = 10_000`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `isChunkLoadError`: 위 4개 메시지 각각 true(it.each), `new Error("boom")` false, `null`/`"str"` false.
  - `canAutoReload(1_000_000)`: 기록 없음 → true; `markAutoReload(1_000_000)` 후 `canAutoReload(1_005_000)` → false; `canAutoReload(1_010_000)` → true.
  - `vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied") })` → `canAutoReload()` false; setItem throw 시 `markAutoReload()`가 throw하지 않음.
  - beforeEach `sessionStorage.clear()`, afterEach `vi.restoreAllMocks()`.
- [ ] **Step 2: 실행해 실패 확인** — `cd client && VITE_FIREBASE_API_KEY= npx vitest run src/shared/ui/routeError/__tests__/chunkReload.test.ts` → FAIL(모듈 없음)
- [ ] **Step 3: 구현** — `now` 기본값 `Date.now()`, 기록은 `String(now)`로 저장·`Number()`로 읽고 NaN이면 기록 없음 취급.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: 커밋** — `feat(client): 청크 로드 실패 판별과 1회 자동 새로고침 가드`

### Task 2: RouteErrorPage 컴포넌트

**Files:**
- Create: `client/src/shared/ui/routeError/routeErrorPage.tsx`, `client/src/shared/ui/routeError/routeErrorPage.styles.tsx`
- Test: `client/src/shared/ui/routeError/__tests__/routeErrorPage.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `isChunkLoadError`, `canAutoReload`, `markAutoReload`
- Produces: `default export RouteErrorPage({ variant }: { variant: "fullPage" | "inline" })`

동작:
- `const error = useRouteError()`. `isNotFound = isRouteErrorResponse(error) && error.status === 404`.
- `const [willReload] = useState(() => isChunkLoadError(error) && canAutoReload())` — 렌더에서는 읽기만(StrictMode 이중 호출 안전). `useEffect`에서 `willReload`면 `markAutoReload(); window.location.reload()`.
- `willReload`이면 `null` 렌더(깜빡임 방지).
- 그 외 404가 아니면 `useEffect`에서 `Sentry.captureException(error)` (useRef로 1회 가드).
- 404: 홈으로 버튼만. 오류: 새로고침(주)·홈으로(보조). 홈으로는 `useNavigate()("/")`.
- 스타일: `fullPage`는 `min-height: 100vh` 중앙 정렬, `inline`은 `height: 100%; min-height: 320px` 중앙 정렬. 제목은 `<h1>`.

- [ ] **Step 1: 실패하는 테스트 작성** — `createMemoryRouter([{ path: "/", element: <div>홈 화면</div> }, { path: "/x", element: <Thrower/>, errorElement: <RouteErrorPage variant="fullPage"/> }, { path: "*", element: null, errorElement: ... }], { initialEntries })` 형태. `@sentry/react`는 `vi.mock`으로 `captureException: vi.fn()`, `window.location.reload`는 기존 errorBoundary.test 방식(defineProperty)으로 스텁, console.error 스파이로 소음 억제.
  - "렌더 오류면 오류 문구와 두 버튼을 보여주고 Sentry에 보고한다": heading `문제가 발생했어요`, 버튼 `새로고침`·`홈으로`, `captureException` 1회(에러 객체 인자).
  - "새로고침 버튼은 페이지를 다시 불러온다": 클릭 → reload 1회.
  - "홈으로 버튼은 /로 이동한다": 클릭 → `홈 화면` 표시, `router.state.location.pathname === "/"`.
  - "404 응답이면 찾을 수 없음 문구와 홈 버튼만, Sentry 보고 안 함": loader에서 `throw new Response("", { status: 404 })` → heading `페이지를 찾을 수 없어요`, `새로고침` 버튼 없음, `captureException` 0회.
  - "청크 오류 첫 발생이면 화면 없이 1회 새로고침": `throw new Error("Failed to fetch dynamically imported module: /assets/x.js")` → reload 1회, heading 없음, `sessionStorage.getItem("tododo:chunkReloadAt")` 존재, Sentry 0회.
  - "10초 안에 청크 오류가 재발하면 새로고침하지 않고 오류 화면": 미리 `sessionStorage.setItem("tododo:chunkReloadAt", String(Date.now()))` → reload 0회, heading `문제가 발생했어요`, Sentry 1회.
- [ ] **Step 2: 실패 확인** — `VITE_FIREBASE_API_KEY= npx vitest run src/shared/ui/routeError/__tests__/routeErrorPage.test.tsx` → FAIL
- [ ] **Step 3: 구현** (위 동작·Global Constraints 문구 그대로)
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** — `feat(client): 라우트 오류·404 공용 화면 RouteErrorPage`

### Task 3: 라우터 배선

**Files:**
- Modify: `client/src/router.tsx`
- Test: `client/src/__tests__/routeErrors.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `RouteErrorPage`
- Produces: `routes` 구조 변경 — 최상위는 `[{ errorElement: <RouteErrorPage variant="fullPage" />, children: [기존 최상위 라우트 전부] }]`. 셸 라우트는 `children: [{ errorElement: <RouteErrorPage variant="inline" />, children: [기존 children..., { path: "*", element: <NotFoundRoute /> }] }]`. `NotFoundRoute`는 router.tsx 안의 작은 컴포넌트로 `throw new Response("Not Found", { status: 404 })` 해서 inline errorElement가 404 문구를 그리게 한다(문구 중복 정의 방지). 비로그인 `*`는 셸의 ProtectedRoute가 `/login`으로 보낸다 — 최상위 `*`는 두지 않는다(같은 순위 충돌 방지). 기존 주석은 유지하고 두 errorElement 층의 이유를 짧게 주석으로 남긴다.

- [ ] **Step 1: 실패하는 테스트 작성** — legalRoutes.test.tsx 패턴(AuthContext.Provider + `createMemoryRouter(routes)`, firebase·firestore mock). 무거운 셸은 `vi.mock("@/App", () => ({ default: () => <div><p>셸 헤더</p><Outlet /></div> }))`, `vi.mock("@sentry/react", () => ({ captureException: vi.fn() }))`.
  - "로그인 사용자가 없는 주소로 가면 셸 안에서 404 안내": `/no-such-page`, signedIn → heading `페이지를 찾을 수 없어요`, `셸 헤더` 보임, pathname 유지.
  - "비로그인 사용자가 없는 주소로 가면 로그인으로 이동": `/no-such-page`, null → `router.state.location.pathname`이 `/login`이 될 때까지 waitFor.
  - "셸 안 페이지가 렌더 중 throw하면 셸은 유지되고 본문에 오류 안내": `vi.mock("@/features/today/pages/todayPage", () => ({ default: () => { throw new Error("boom") } }))`, `/today`, signedIn → heading `문제가 발생했어요` + `셸 헤더` 보임.
  - "셸 밖 페이지가 throw하면 전체 화면 오류 안내": `vi.mock("@/features/legal/pages/legalPage", () => ({ default: () => { throw new Error("boom") } }))`, `/terms` → heading `문제가 발생했어요`, `셸 헤더` 없음.
  - 기존 `src/__tests__/legalRoutes.test.tsx`가 계속 통과해야 함(mock 충돌 시 이 파일은 별도 파일이므로 영향 없음).
- [ ] **Step 2: 실패 확인** — `VITE_FIREBASE_API_KEY= npx vitest run src/__tests__/routeErrors.test.tsx` → FAIL
- [ ] **Step 3: router.tsx 수정**
- [ ] **Step 4: 통과 확인** — 위 + `src/__tests__/legalRoutes.test.tsx`
- [ ] **Step 5: 전체 검증** — `cd client && VITE_FIREBASE_API_KEY= npx vitest run` 전부 PASS, `npx tsc -b` 오류 0, `npm run lint` 오류 0, `npm run build` 성공
- [ ] **Step 6: 커밋** — `feat(client): 라우터에 오류·404 화면 연결(셸 안 inline, 셸 밖 전체 화면)`

### 최종 수동 확인 (실행자)

`npm run dev` 후 브라우저에서: 로그인 상태 `/abc` → 셸 안 404, 홈으로 → /today. 오늘 화면 컴포넌트에 임시 throw를 넣어 inline 오류 확인 후 원복(커밋 금지). 다크모드에서 대비 확인.
