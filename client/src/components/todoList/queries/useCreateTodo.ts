import { useMutation } from "@tanstack/react-query";
import { createTodo } from "../api";
import type { Todo } from "../../../types/todo.type";

const useCreateTodo = () => {
  return useMutation({
    mutationFn: (todo: Todo) => createTodo(todo),
  });
};

export default useCreateTodo;
