import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import ProtectedRoute from "@/features/auth/components/protectedRoute";
import RootGate from "@/features/auth/components/rootGate";
import CheckboxSkeleton from "@/shared/ui/skeleton/checkboxSkeleton";
import KanbanSkeleton from "@/shared/ui/skeleton/kanbanSkeleton";
import TodayItemSkeleton from "@/shared/ui/skeleton/todayItemSkeleton";
import CalendarSkeleton from "@/shared/ui/skeleton/calendarSkeleton";
import InsightsSkeleton from "@/shared/ui/skeleton/insightsSkeleton";
import RouteErrorPage from "@/shared/ui/routeError/routeErrorPage";
import { preloadableLazy } from "@/shared/lib/preloadableLazy";

// 라우트 컴포넌트는 전부 lazy로 둔다. 정적 import 하나만 되살아나도 해당 라우트의
// 의존성(FullCalendar, dnd-kit, Firestore 등)이 통째로 초기 청크로 딸려온다.
//
// App(인증 레이아웃)을 lazy로 두는 것이 특히 중요하다. App은 useRunStartupMaintenance를
// 통해 할 일 도메인 → todoApi → Firestore로 이어지므로, eager로 두면 로그인 전 화면에서도
// Firestore SDK를 내려받게 된다.
//
// ProtectedRoute / RootGate만 eager다. 최초 라우팅 판단에 즉시 필요하고 auth 외
// 의존성이 없어 비용이 사실상 0이다.
// 셸과 셸 안 페이지는 preloadableLazy로 둔다. preloadSignedInRoute가 미리 받아 둔 모듈을
// 첫 렌더에서 바로 그려, React.lazy의 첫 suspend → fallback → 300ms 커밋 스로틀을 피한다
// (자세한 이유는 shared/lib/preloadableLazy.tsx).
const AppChunk = preloadableLazy(() => import("@/App"));
const TodayChunk = preloadableLazy(
  () => import("@/features/today/pages/todayPage"),
);
const TodoListChunk = preloadableLazy(
  () => import("@/features/todo/pages/todoListPage"),
);
const TodoDetailChunk = preloadableLazy(
  () => import("@/features/todo/components/todoDetail/todoDetail"),
);
const CalendarChunk = preloadableLazy(
  () => import("@/features/dashboard/Pages/calendarPage"),
);
const KanbanChunk = preloadableLazy(
  () => import("@/features/kanban/pages/kanbanPage"),
);
const InsightsChunk = preloadableLazy(
  () => import("@/features/insights/pages/insightsPage"),
);
const PremiumChunk = preloadableLazy(
  () => import("@/features/billing/pages/premiumPage"),
);

const App = AppChunk.Component;
const LoginPage = lazy(() => import("@/features/auth/pages/loginPage"));
const GuestTodayPage = lazy(
  () => import("@/features/guest/pages/guestTodayPage"),
);
const TodayPage = TodayChunk.Component;
const TodoListPage = TodoListChunk.Component;
const TodoDetail = TodoDetailChunk.Component;
const CalendarPage = CalendarChunk.Component;
const KanbanPage = KanbanChunk.Component;
const InsightsPage = InsightsChunk.Component;
const PremiumPage = PremiumChunk.Component;
// 법적 페이지는 로그인 여부와 무관하게 열려야 한다(Paddle 심사자는 로그인하지 않는다).
// 그래서 RootGate·ProtectedRoute 밖의 최상위 라우트로 둔다.
const LegalPage = lazy(() => import("@/features/legal/pages/legalPage"));

// 셸 안 경로의 첫 세그먼트 → 그 페이지 청크. "/"는 로그인 사용자를 /today로 보내므로
// today로 취급한다. 여기 없는 경로(login·guest·약관 등)는 미리 받지 않는다.
// 객체 대신 Map인 이유: "/constructor" 같은 주소가 프로토타입 메서드를 꺼내 오지 않게.
const shellPageLoaders = new Map<string, () => Promise<unknown>>([
  ["", TodayChunk.preload],
  ["today", TodayChunk.preload],
  ["todo", TodoListChunk.preload],
  ["calendar", CalendarChunk.preload],
  ["kanban", KanbanChunk.preload],
  ["insights", InsightsChunk.preload],
  ["premium", PremiumChunk.preload],
]);

/**
 * 로그인 사용자로 보이면 인증 확인(accounts:lookup)을 기다리지 않고 셸·페이지 청크를
 * 미리 받기 시작한다. 지금은 Auth 응답 → 청크 → Firestore가 직렬이라 모바일에서
 * FCP·LCP가 그 합만큼 늦어진다. preloadableLazy는 preload와 렌더가 같은 Promise를
 * 공유하고, 렌더 시점에 이미 받아 둔 모듈은 suspend 없이 바로 그린다.
 *
 * 실패는 삼킨다. 실제로 필요하면 lazy가 다시 import하고, 그때의 실패는 기존 경로
 * (RouteErrorPage·청크 실패 자동 새로고침)가 처리한다. 여기서 던지면 쓰지도 않을
 * 청크 실패가 unhandled rejection으로 Sentry에 쌓인다.
 */
export const preloadSignedInRoute = async (pathname: string): Promise<void> => {
  // React Router는 기본이 대소문자 무시라 /Today도 오늘 화면이다 → 소문자로 맞춘다.
  // 세그먼트 수도 라우트와 같아야 한다(/today/x·/todo/a/b는 셸 안 404라 받을 게 없다).
  const segments = pathname.toLowerCase().split("/").filter(Boolean);
  const [first = ""] = segments;
  const pageLoader =
    first === "todo" && segments.length === 2
      ? TodoDetailChunk.preload
      : segments.length <= 1
        ? shellPageLoaders.get(first)
        : undefined;
  if (!pageLoader) return;
  // allSettled라 어느 쪽이 실패해도 거부되지 않는다(반환값은 완료 시점을 알려 줄 뿐).
  await Promise.allSettled([AppChunk.preload(), pageLoader()]);
};

// 청크를 받는 동안 보여줄 것. fallback이 null인 곳은 ProtectedRoute/RootGate가
// 인증 로딩 중 null을 반환하는 기존 컨벤션과 맞춘 것이다(깜빡임 방지).
const withSuspense = (element: ReactNode, fallback: ReactNode = null) => (
  <Suspense fallback={fallback}>{element}</Suspense>
);

// 셸 안의 없는 주소. loader에서 404 Response를 던져 inline errorElement가 404 문구를
// 그리게 한다(문구를 RouteErrorPage 한 곳에만 둔다). 렌더 중에 던지면 라우터가
// ErrorResponse로 바꾸지 않아 isRouteErrorResponse가 false가 되므로 loader여야 한다.
const notFoundLoader = () => {
  throw new Response("Not Found", { status: 404 });
};

// 오류 화면은 두 층이다.
// - 바깥(pathless 루트): 셸 밖 라우트(로그인·게스트·약관)와 셸 자체가 실패했을 때 전체 화면.
// - 안쪽(셸 children을 감싸는 pathless 라우트): 셸 안 페이지 오류는 헤더·SNB를 남긴 채
//   Outlet 자리에만 안내 → 사용자가 사이드바로 바로 다른 화면으로 이동할 수 있다.
// 없는 주소용 "*"는 셸 안에만 둔다. 최상위에도 두면 셸 안 "*"와 순위가 같아 충돌하고,
// 비로그인 사용자는 ProtectedRoute가 먼저 /login으로 보내므로 따로 필요 없다.
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage variant="fullPage" />,
    children: [
      {
        path: "/login",
        element: withSuspense(<LoginPage />),
      },
      {
        path: "/",
        element: <RootGate />,
      },
      {
        path: "/guest",
        element: withSuspense(<GuestTodayPage />),
      },
      { path: "/terms", element: withSuspense(<LegalPage slug="terms" />) },
      { path: "/privacy", element: withSuspense(<LegalPage slug="privacy" />) },
      { path: "/refund", element: withSuspense(<LegalPage slug="refund" />) },
      {
        // Suspense가 2단인 이유: 바깥은 App 셸(헤더/SNB/푸터), 안쪽은 페이지 본문이다.
        // 셸 청크는 최초 1회만 받으므로 이후 라우트 이동에서는 안쪽 스켈레톤만 교체된다.
        element: <ProtectedRoute>{withSuspense(<App />)}</ProtectedRoute>,
        children: [
          {
            errorElement: <RouteErrorPage variant="inline" />,
            children: [
              {
                path: "today",
                element: withSuspense(<TodayPage />, <TodayItemSkeleton />),
              },
              {
                path: "todo/:id",
                element: withSuspense(
                  <TodoDetail />,
                  <CheckboxSkeleton count={3} />,
                ),
              },
              {
                path: "todo",
                element: withSuspense(
                  <TodoListPage />,
                  <CheckboxSkeleton count={5} />,
                ),
              },
              {
                path: "calendar",
                element: withSuspense(<CalendarPage />, <CalendarSkeleton />),
              },
              {
                path: "kanban",
                element: withSuspense(<KanbanPage />, <KanbanSkeleton />),
              },
              {
                path: "insights",
                element: withSuspense(<InsightsPage />, <InsightsSkeleton />),
              },
              {
                path: "premium",
                element: withSuspense(<PremiumPage />),
              },
              { path: "*", loader: notFoundLoader },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
