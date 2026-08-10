import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";
import ProtectedRoute from "@/features/auth/components/protectedRoute";
import RootGate from "@/features/auth/components/rootGate";
import CheckboxSkeleton from "@/shared/ui/skeleton/checkboxSkeleton";
import KanbanSkeleton from "@/shared/ui/skeleton/kanbanSkeleton";
import TodayItemSkeleton from "@/shared/ui/skeleton/todayItemSkeleton";
import CalendarSkeleton from "@/shared/ui/skeleton/calendarSkeleton";

// 라우트 컴포넌트는 전부 lazy로 둔다. 정적 import 하나만 되살아나도 해당 라우트의
// 의존성(FullCalendar, dnd-kit, Firestore 등)이 통째로 초기 청크로 딸려온다.
//
// App(인증 레이아웃)을 lazy로 두는 것이 특히 중요하다. App은 useTodo를 통해 할 일
// 도메인 → todoApi → Firestore로 이어지므로, eager로 두면 로그인 전 화면에서도
// Firestore SDK를 내려받게 된다.
//
// ProtectedRoute / RootGate만 eager다. 최초 라우팅 판단에 즉시 필요하고 auth 외
// 의존성이 없어 비용이 사실상 0이다.
const App = lazy(() => import("@/App"));
const LoginPage = lazy(() => import("@/features/auth/pages/loginPage"));
const GuestTodayPage = lazy(
  () => import("@/features/guest/pages/guestTodayPage"),
);
const TodayPage = lazy(() => import("@/features/today/pages/todayPage"));
const TodoListPage = lazy(() => import("@/features/todo/pages/todoListPage"));
const TodoDetail = lazy(
  () => import("@/features/todo/components/todoDetail/todoDetail"),
);
const CalendarPage = lazy(
  () => import("@/features/dashboard/Pages/calendarPage"),
);
const KanbanPage = lazy(() => import("@/features/kanban/pages/kanbanPage"));

// 청크를 받는 동안 보여줄 것. fallback이 null인 곳은 ProtectedRoute/RootGate가
// 인증 로딩 중 null을 반환하는 기존 컨벤션과 맞춘 것이다(깜빡임 방지).
const withSuspense = (element: ReactNode, fallback: ReactNode = null) => (
  <Suspense fallback={fallback}>{element}</Suspense>
);

export const router = createBrowserRouter([
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
  {
    // Suspense가 2단인 이유: 바깥은 App 셸(헤더/SNB/푸터), 안쪽은 페이지 본문이다.
    // 셸 청크는 최초 1회만 받으므로 이후 라우트 이동에서는 안쪽 스켈레톤만 교체된다.
    element: (
      <ProtectedRoute>{withSuspense(<App />)}</ProtectedRoute>
    ),
    children: [
      {
        path: "today",
        element: withSuspense(<TodayPage />, <TodayItemSkeleton />),
      },
      {
        path: "todo/:id",
        element: withSuspense(<TodoDetail />, <CheckboxSkeleton count={3} />),
      },
      {
        path: "todo",
        element: withSuspense(<TodoListPage />, <CheckboxSkeleton count={5} />),
      },
      {
        path: "calendar",
        element: withSuspense(<CalendarPage />, <CalendarSkeleton />),
      },
      {
        path: "kanban",
        element: withSuspense(<KanbanPage />, <KanbanSkeleton />),
      },
    ],
  },
]);
