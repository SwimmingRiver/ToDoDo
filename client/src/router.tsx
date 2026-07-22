import { createBrowserRouter } from "react-router-dom";
import App from "@/App";
import TodoListPage from "@/features/todo/pages/todoListPage";
import CalendarPage from "@/features/dashboard/Pages/calendarPage";
import KanbanPage from "@/features/kanban/pages/kanbanPage";
import { TodoDetail } from "@/features/todo";
import LoginPage from "@/features/auth/pages/loginPage";
import ProtectedRoute from "@/features/auth/components/protectedRoute";
import RootGate from "@/features/auth/components/rootGate";
import TodayPage from "@/features/today/pages/todayPage";
import GuestTodayPage from "@/features/guest/pages/guestTodayPage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: <RootGate />,
  },
  {
    path: "/guest",
    element: <GuestTodayPage />,
  },
  {
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
    children: [
      {
        path: "today",
        element: <TodayPage />,
      },
      {
        path: "todo/:id",
        element: <TodoDetail />,
      },
      {
        path: "todo",
        element: <TodoListPage />,
      },
      {
        path: "calendar",
        element: <CalendarPage />,
      },
      {
        path: "kanban",
        element: <KanbanPage />,
      },
    ],
  },
]);
