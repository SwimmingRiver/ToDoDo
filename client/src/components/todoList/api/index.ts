import type { Todo } from "../../../types/todo.type";
import { api } from "../../../utils/api";

// MongoDB 응답 타입 (서버에서 받는 타입)
type MongoTodo = Omit<Todo, "id"> & { _id: string };

// MongoDB의 _id를 클라이언트의 id로 변환
const mapMongoToTodo = (mongoTodo: MongoTodo): Todo => ({
  ...mongoTodo,
  id: mongoTodo._id,
});

export const createTodo = async (todo: Todo) => {
  const response = await api.post<MongoTodo>("/todo-list", todo);
  return mapMongoToTodo(response.data);
};

export const getTodos = async () => {
  try {
    const response = await api.get<Todo[]>("/todo-list");
    return response.data;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to fetch todos"
    );
  }
};

export const editTodo = async (todo: Todo) => {
  const response = await api.patch<MongoTodo>(`/todo-list/${todo.id}`, todo);
  return mapMongoToTodo(response.data);
};

export const deleteTodo = async (id: string) => {
  const response = await api.delete<Todo>(`/todo-list/${id}`);
  return response.data;
};

export const updateToDone = async (id: string) => {
  const response = await api.patch<MongoTodo>(`/todo-list/${id}/done`);
  return mapMongoToTodo(response.data);
};

export const createChildTodo = async (parentId: string, todo: Partial<Todo>) => {
  const response = await api.post<MongoTodo>(`/todo-list/${parentId}/child`, todo);
  return mapMongoToTodo(response.data);
};
