import { useMutation } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { useToast } from "@/shared";
import { createPortalUrl } from "../api/billingApi";

/** 비동기 호출 뒤 새 창을 열면 팝업 차단에 걸리므로 같은 탭에서 Paddle 포털로 이동한다. */
export const useOpenPortal = () => {
  const toast = useToast();
  return useMutation({
    mutationFn: createPortalUrl,
    onSuccess: (url) => window.location.assign(url),
    onError: (error) => {
      toast.error("구독 관리 화면을 열지 못했어요", "잠시 후 다시 시도해주세요");
      Sentry.captureException(error, { tags: { feature: "billing" } });
    },
  });
};
