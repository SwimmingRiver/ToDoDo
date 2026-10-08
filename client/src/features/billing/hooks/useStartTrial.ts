import { useMutation } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { useToast } from "@/shared";
import { BillingApiError, startTrial } from "../api/billingApi";

/** 성공 후 화면 전환은 useEntitlementSync(onSnapshot)가 처리한다 — 여기서 캐시를 직접 고치지 않는다. */
export const useStartTrial = () => {
  const toast = useToast();
  return useMutation({
    mutationFn: startTrial,
    onSuccess: () => toast.success("7일 무료 체험이 시작됐어요", "모든 프리미엄 기능을 써보세요"),
    onError: (error) => {
      if (error instanceof BillingApiError && error.code === "NOT_ALLOWED") {
        toast.info("아직 준비 중이에요", "곧 체험을 열어드릴게요");
      } else if (error instanceof BillingApiError && error.status === 409) {
        toast.info("이미 체험을 사용했어요", "구독하면 계속 이용할 수 있어요");
      } else {
        toast.error("체험을 시작하지 못했어요", "잠시 후 다시 시도해주세요");
        Sentry.captureException(error, { tags: { feature: "billing" } });
      }
    },
  });
};
