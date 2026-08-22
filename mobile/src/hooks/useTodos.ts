import { useQuery } from "@tanstack/react-query";
import { getTodos } from "@tododo/core";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";

export const useTodos = () => {
  const { user } = useAuthState();

  return useQuery({
    queryKey: ["todos", user?.uid],
    queryFn: () => getTodos(db, user!.uid),
    enabled: !!user,
  });
};
