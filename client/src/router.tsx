import { createBrowserRouter } from "react-router-dom";
import App from "@/App";
import TodoListPage from "@/features/todo/pages/todoListPage";
import CalendarPage from "@/features/dashboard/Pages/calendarPage";
import PieChartPage from "@/features/dashboard/Pages/pieChartPage";
import KanbanPage from "@/features/kanban/pages/kanbanPage";
import HomePage from "@/HomePage";
import { TodoDetail } from "@/features/todo";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        path: "",
        element: <HomePage />,
        children: [
          {
            path: "todo/:id",
            element: <TodoDetail />,
          },
        ],
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
        path: "pie-chart",
        element: <PieChartPage />,
      },
      {
        path: "kanban",
        element: <KanbanPage />,
      },
    ],
  },
]);
