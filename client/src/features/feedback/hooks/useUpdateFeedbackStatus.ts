import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateFeedbackStatus, type FeedbackStatus } from "../api";
import { FEEDBACK_ADMIN_KEY } from "./useFeedbackList";

export const useUpdateFeedbackStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: FeedbackStatus }) =>
      updateFeedbackStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEEDBACK_ADMIN_KEY }),
  });
};
