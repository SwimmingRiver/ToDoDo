import TodoList from "@/features/todo/components/todoList";
import { useTodo } from "@/features/todo/hooks";
export default function TodoListPage() {
  const { useGetTodos: todosQuery } = useTodo();
  const { data: todos } = todosQuery;
  return <TodoList todos={todos ?? []} />;
}
