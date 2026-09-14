import { useSubmitFeedback } from "@/features/feedback/hooks";
import { useToast } from "@/shared";

/**
 * 프리미엄 잠금 화면(캘린더 연동, 인사이트 등) 여러 곳이 공유하는 "관심 있어요"
 * CTA 로직. 결제 연동 전까지는 기존 피드백 수집 채널에 "[프리미엄 관심]"
 * 접두사로 남기는 것으로 대신한다 — 수요 파악용 placeholder.
 *
 * featureLabel은 "기능"으로 끝나는 명사구를 넘긴다(예: "구글 캘린더 연동
 * 기능"). "을 구독하고 싶어요"를 붙였을 때 받침 상관없이 자연스럽게
 * 이어지도록 하기 위함이다.
 */
export const useUpgradeInterest = (featureLabel: string) => {
  const { mutate, isPending } = useSubmitFeedback();
  const toast = useToast();

  const submitInterest = () => {
    if (isPending) return;
    mutate(`[프리미엄 관심] ${featureLabel}을 구독하고 싶어요`, {
      onSuccess: () => toast.success("문의가 접수되었습니다", "출시되면 안내해드릴게요"),
      onError: () => toast.error("문의 접수 실패", "잠시 후 다시 시도해주세요"),
    });
  };

  return { submitInterest, isPending };
};
