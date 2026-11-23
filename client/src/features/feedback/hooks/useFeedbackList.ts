import { useQuery } from "@tanstack/react-query";
import { listFeedback } from "../api";

export const FEEDBACK_ADMIN_KEY = ["feedback", "admin"] as const;

/** 운영자만 조회한다(비운영자는 쿼리 자체를 보내지 않음). */
export const useFeedbackList = (isOperator: boolean) =>
  useQuery({
    queryKey: FEEDBACK_ADMIN_KEY,
    queryFn: listFeedback,
    enabled: isOperator,
  });
