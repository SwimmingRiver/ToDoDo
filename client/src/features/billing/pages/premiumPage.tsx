import { BarChart3, CalendarDays, Sparkles, type LucideIcon } from "lucide-react";
import { useEntitlement } from "@/features/entitlement/hooks/useEntitlement";
import { DEFAULT_ENTITLEMENT } from "@/features/entitlement/types";
import { PREMIUM_MONTHLY_PRICE_LABEL } from "../config";
import { useCheckout, useOpenPortal, useStartTrial } from "../hooks";
import { formatMonthDay, getPremiumView } from "../utils/premiumView";
import {
  Actions,
  Benefit,
  BenefitDescription,
  BenefitList,
  BenefitText,
  BenefitTitle,
  Card,
  Heading,
  HintText,
  PremiumBody,
  PremiumContainer,
  Price,
  PrimaryButton,
  SecondaryButton,
  StatusText,
  Warning,
} from "./premiumPage.styles";

const BENEFITS: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Sparkles, title: "AI 할 일 플랜", description: "목표를 적으면 실행 단계와 날짜를 나눠 제안해요" },
  { icon: CalendarDays, title: "구글 캘린더 연동", description: "할 일을 구글 캘린더에 동기화해요" },
  { icon: BarChart3, title: "완료 통계", description: "완료율·연속 달성일·우선순위 분포를 확인해요" },
];

const PremiumPage = () => {
  const { data, isLoading } = useEntitlement();
  const checkout = useCheckout();
  const trial = useStartTrial();
  const portal = useOpenPortal();

  if (isLoading) return null;

  const view = getPremiumView(data ?? DEFAULT_ENTITLEMENT, Date.now());
  const checkoutBusy = checkout.phase !== "idle";
  const busy = checkoutBusy || trial.isPending || portal.isPending;

  const renderStatus = () => {
    switch (view.kind) {
      case "offer":
        return (
          <Actions>
            {view.canTrial && (
              <PrimaryButton type="button" disabled={busy} onClick={() => trial.mutate()}>
                7일 무료 체험
              </PrimaryButton>
            )}
            {view.canTrial ? (
              <SecondaryButton type="button" disabled={busy} onClick={() => void checkout.start()}>
                바로 구독하기
              </SecondaryButton>
            ) : (
              <PrimaryButton type="button" disabled={busy} onClick={() => void checkout.start()}>
                구독하기
              </PrimaryButton>
            )}
            {view.canTrial && <HintText>체험은 카드 등록 없이 계정당 한 번 쓸 수 있어요</HintText>}
          </Actions>
        );
      case "trialing":
        return (
          <>
            <StatusText>
              {formatMonthDay(view.until)}까지 체험 중 ({view.daysLeft}일 남음)
            </StatusText>
            <PrimaryButton type="button" disabled={busy} onClick={() => void checkout.start()}>
              구독하기
            </PrimaryButton>
            <HintText>지금 구독하면 바로 첫 결제가 되고, 남은 체험 기간은 이어지지 않아요</HintText>
          </>
        );
      case "active":
        return (
          <>
            <StatusText>
              {view.nextBillingAt ? `다음 결제일 ${formatMonthDay(view.nextBillingAt)}` : "프리미엄 이용 중"}
            </StatusText>
            {view.canManage && (
              <SecondaryButton type="button" disabled={busy} onClick={() => portal.mutate()}>
                구독 관리
              </SecondaryButton>
            )}
          </>
        );
      case "canceling":
        return (
          <>
            <StatusText>{formatMonthDay(view.until)}까지 이용 가능</StatusText>
            <SecondaryButton type="button" disabled={busy} onClick={() => portal.mutate()}>
              구독 관리
            </SecondaryButton>
            <HintText>구독 관리에서 해지를 취소할 수 있어요</HintText>
          </>
        );
      case "pastDue":
        return (
          <>
            <Warning role="alert">결제에 실패했어요. 결제 수단을 확인해 주세요</Warning>
            <PrimaryButton type="button" disabled={busy} onClick={() => portal.mutate()}>
              결제 수단 변경
            </PrimaryButton>
          </>
        );
    }
  };

  return (
    <PremiumContainer>
      <PremiumBody>
        <Heading>ToDoDo 프리미엄</Heading>
        <Card>
          <BenefitList>
            {BENEFITS.map(({ icon: Icon, title, description }) => (
              <Benefit key={title}>
                <Icon size={20} aria-hidden="true" />
                <BenefitText>
                  <BenefitTitle>{title}</BenefitTitle>
                  <BenefitDescription>{description}</BenefitDescription>
                </BenefitText>
              </Benefit>
            ))}
          </BenefitList>
          <Price>{PREMIUM_MONTHLY_PRICE_LABEL}</Price>
        </Card>
        <Card aria-live="polite">
          {renderStatus()}
          {checkout.phase === "confirming" && <HintText>결제 확인 중…</HintText>}
          {checkout.phase === "slow" && <HintText>결제는 완료됐어요. 반영까지 잠시 걸릴 수 있어요</HintText>}
        </Card>
      </PremiumBody>
    </PremiumContainer>
  );
};

export default PremiumPage;
