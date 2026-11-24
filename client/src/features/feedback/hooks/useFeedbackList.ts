import { useInfiniteQuery } from "@tanstack/react-query";
import { listFeedback } from "../api";

export const FEEDBACK_ADMIN_KEY = ["feedback", "admin"] as const;

/** 운영자만 조회한다(비운영자는 쿼리 자체를 보내지 않음). createdAt 커서로 더 불러온다. */
export const useFeedbackList = (isOperator: boolean) =>
  useInfiniteQuery({
    queryKey: FEEDBACK_ADMIN_KEY,
    queryFn: ({ pageParam }) => listFeedback(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: isOperator,
  });
