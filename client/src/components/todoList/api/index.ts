import type { Todo } from "../../../types/todo.type";
import { api } from "../../../utils/api";

export const createTodo = async (todo: Todo) => {
  const response = await api.post<Todo>("/todo-list", todo);
  return response.data;
};
