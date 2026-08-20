import { useQuery } from "@tanstack/react-query";
import { getTodoDetail } from "../api";

export const useTodoDetail = ({ id }: { id: string }) => {
  const { data: todo } = useQuery({
    queryKey: ["todoDetail", id],
    queryFn: () => getTodoDetail(id),
  });
  return { todo };
};
