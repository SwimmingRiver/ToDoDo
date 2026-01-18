import { useQuery } from "@tanstack/react-query";
import { getSearchTodoList } from "../api";

export const useSearchTodo = (query: string) => {
  return useQuery({
    queryKey: ["searchTodoList", query],
    queryFn: () => getSearchTodoList(query),
    enabled: query.length > 0,
    staleTime: 1000 * 60, // 1분간 캐시
  });
};
