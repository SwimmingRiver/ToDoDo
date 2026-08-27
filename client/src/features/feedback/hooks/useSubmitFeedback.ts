import { useMutation } from "@tanstack/react-query";
import { submitFeedback } from "../api";

export const useSubmitFeedback = () => {
  return useMutation({
    mutationFn: (content: string) => submitFeedback(content),
  });
};
