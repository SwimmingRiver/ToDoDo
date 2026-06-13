import TodoList from "@/features/todo/components/todoList";
import { useTodo } from "@/features/todo/hooks";
import { CheckboxSkeleton, EmptyState } from "@/shared";
import { AlertCircle } from "lucide-react";

export default function TodoListPage() {
  const { useGetTodos: todosQuery } = useTodo();
  const { data: todos, isLoading, isError } = todosQuery;

  if (isLoading) {
    return <CheckboxSkeleton count={5} />;
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="데이터를 불러오지 못했습니다"
        description="네트워크 연결을 확인하고 다시 시도해주세요"
      />
    );
  }

  return <TodoList todos={todos ?? []} />;
}
