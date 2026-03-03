import ResizeableLayout from "./layouts/resizeableLayout/resizeableLayout";
import TodoList from "./features/todo/components/todoList";
import PieChart from "./features/dashboard/components/pieChart";
import { useTodo } from "./features/todo/hooks";
export default function HomePage() {
  const { useGetTodos } = useTodo();
  const { data: todos } = useGetTodos;
  return (
    <ResizeableLayout
      children1={<TodoList todos={todos ?? []} />}
      children2={<PieChart />}
      direction="row"
    />
  );
}
