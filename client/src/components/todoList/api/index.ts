import type { Todo } from "../../../types/todo.type";
import { api } from "../../../utils/api";

export const createTodo = async (todo: Todo) => {
  const response = await api.post<Todo>("/todo-list", todo);
  return response.data;
};

export const getTodos = async () => {
  try {
    const response = await api.get<any[]>("/todo-list");
    // 서버의 _id를 id로 매핑
    const todos = response.data.map((todo) => ({
      ...todo,
      id: todo._id || todo.id,
    }));
    return todos as Todo[];
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to fetch todos"
    );
  }
};
