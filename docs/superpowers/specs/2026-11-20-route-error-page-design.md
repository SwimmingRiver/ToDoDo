# 라우트 오류·404 페이지 설계 (웹)

작성일: 2026-11-20 · 범위: `client/` 웹만 (모바일 RN 무관) · 크기: 작은 변경

## 의도 / 왜

렌더링 중 오류(타입 에러 등)가 나면 지금은 react-router 기본 오류 화면("Unexpected Application Error", 개발 모드는 "Hey developer 👋")이 뜬다. 사용자는 이걸 "앱이 죽었다"로 받아들이고 이탈한다. 서비스 안의 화면으로 안내하고 홈 이동·새로고침 길을 주어 이탈을 막는 게 목적.

부수 효과: 라우터가 오류를 자체 처리해 `main.tsx`의 `ErrorBoundary`(Sentry 보고)까지 오지 않으므로, 라우트 렌더 오류는 현재 Sentry에 안 잡히고 있을 가능성이 크다 — 이번에 함께 보고되게 한다.

## 목표 / 비목표 / 반목표

- 목표: 모든 라우트의 렌더·로더 오류를 서비스 화면으로 받는다 / 없는 주소는 404 안내 / 오류는 Sentry 보고 / 배포 직후 옛 탭의 청크 로드 실패는 자동 복구
- 비목표: 오류 원인 자체 수정, 모바일 앱, 기존 최상위 `ErrorBoundary` 제거(라우터 밖 오류용으로 유지)
- 반목표: 청크 실패 자동 새로고침이 무한 반복되는 것 / 오류 화면 자체가 다시 오류를 내는 것(오류 화면은 auth·Firestore 등 무거운 의존 없이) / 초기 번들에 무거운 의존성이 딸려오는 것

## 접근 (검토한 안)

- A. 최상위 라우트마다 전체 화면 `errorElement` + `*` 404 — 가장 단순하지만 헤더/사이드바까지 사라져 "앱 전체가 죽은" 인상.
- **B. (선택) 레이아웃 안 오류 + 전체 화면 폴백** — 로그인 후 화면은 셸(헤더·SNB)을 유지한 채 본문 자리에만 안내, 사용자가 사이드바로 바로 다른 메뉴로 이동 가능. 셸 밖 라우트·셸 자체 실패는 전체 화면으로. 사용자가 이탈 방지 목적에 맞아 B 선택.
- (버림) 각 Suspense를 클래스 ErrorBoundary로 감싸기 — 라우터가 먼저 잡으므로 효과 없음, 중복.

## 설계

1. **공용 오류 화면 컴포넌트** `RouteErrorPage` (`shared/ui/routeError/` 또는 유사 위치 — 빌더 판단)
   - `useRouteError()`로 오류 수신. `isRouteErrorResponse` && 404 → "페이지를 찾을 수 없어요" 문구, 그 외 → "문제가 발생했어요" 문구.
   - 버튼: **홈으로**(`/` — RootGate가 로그인 여부로 /today 또는 /login 분기) / **새로고침**(`window.location.reload()`).
   - `variant`: `fullPage`(100vh 중앙) / `inline`(셸 본문 영역 안).
   - 404가 아닌 오류는 `Sentry.captureException` (effect에서 1회, 기존 scrubEvent 정책 유지).
   - 색·타이포는 기존 토큰(`colors`) 사용 → 다크모드 자동.
2. **라우트 배치** (`router.tsx`)
   - 셸 밖 최상위 라우트(`/login`, `/`, `/guest`, 약관 3종, 셸 라우트 자체)에 `errorElement: fullPage`.
   - 셸(App) 라우트의 children을 pathless 라우트 하나로 감싸고 거기에 `errorElement: inline` → 오류가 `<Outlet />` 자리에 렌더되어 셸 유지.
   - 셸 children에 `path: "*"`를 두어 로그인 사용자의 없는 주소는 셸 안 404. 셸 밖 최상위에도 `path: "*"` 404(fullPage) — 단 비로그인 시 ProtectedRoute 리다이렉트와의 우선순위는 빌더가 확인(로그인 사용자 기준 셸 안 404가 우선되도록).
3. **청크 로드 실패 자동 복구**
   - 판별: 메시지에 "Failed to fetch dynamically imported module" / "Importing a module script failed"(Safari) / "error loading dynamically imported module"(Firefox) 등 포함.
   - 첫 실패 시 `sessionStorage`에 시각 기록 후 `location.reload()` 1회. 기록이 최근(5분 이내 — 리뷰 후 10초에서 상향, 느린 망 반복 방지)이거나 오프라인(`navigator.onLine === false`)이면 재시도하지 않고 오류 화면 표시. storage 접근은 try/catch, 실패 시 자동 새로고침 생략하고 화면 표시.
   - 청크 실패는 Sentry에 별도 보고 안 함(자동 복구 성공 시 노이즈) — 재시도 후에도 실패해 화면이 뜰 때만 보고.
4. **테스트**: 404 문구, 일반 오류 문구+Sentry 호출, 셸 안 오류 시 셸 유지, 청크 오류 1회 reload·재발 시 화면 표시. TZ/CI 규칙(`VITE_FIREBASE_API_KEY=` 실행) 준수.

## 빌더에게 맡기는 것

파일 위치·이름, 문구 세부, 아이콘 사용 여부(lucide), 재시도 판정 시간 창, 테스트 구성.
