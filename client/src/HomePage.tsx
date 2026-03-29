import ResizeableLayout from "@/layouts/resizeableLayout/resizeableLayout";
import TodoList from "@/features/todo/components/todoList";
import PieChart from "@/features/dashboard/components/pieChart";
import { useTodo } from "@/features/todo/hooks";
import DueTodo from "@/features/todo/components/dueTodo";
import { Outlet } from "react-router-dom";
import { useMediaQuery } from "@/shared/hooks";
import MobileHomePage from "@/pages/MobileHomePage";

export default function HomePage() {
  const { useGetTodos } = useTodo();
  const { data: todos } = useGetTodos;
  const isMobile = useMediaQuery("tablet");

  if (isMobile) {
    return (
      <>
        <MobileHomePage todos={todos ?? []} />
        <Outlet />
      </>
    );
  }

  return (
    <>
      <ResizeableLayout
        children1={<TodoList todos={todos ?? []} />}
        children2={
          <ResizeableLayout
            children1={<DueTodo todos={todos ?? []} />}
            children2={<PieChart />}
            direction="column"
          />
        }
        direction="row"
      />
      <Outlet />
    </>
  );
}
