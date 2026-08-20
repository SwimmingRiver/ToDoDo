import { useQuery } from "@tanstack/react-query";
import { getTodos } from "../api";

export const useGetTodos = () =>
  useQuery({
    queryKey: ["todos"],
    queryFn: getTodos,
  });
