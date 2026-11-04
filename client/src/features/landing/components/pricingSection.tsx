import { Check } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PREMIUM_BENEFITS, PREMIUM_MONTHLY_PRICE_LABEL } from "@/features/billing/config";
import {
  FeatureDescription,
  FeatureItem,
  FeatureList,
  FeatureText,
  Heading,
  Notes,
  PlanButton,
  PlanCard,
  PlanHint,
  PlanName,
  PlanPrice,
  Plans,
  PriceNote,
  PriceRow,
  Section,
} from "./pricingSection.styles";

const FREE_FEATURES = ["Today·목록·칸반·캘린더", "반복 할 일", "마감 알림"] as const;

/**
 * 비로그인 방문자에게 무료/프리미엄 차이와 가격을 보여준다. Paddle 도메인 심사는 로그인 없이
 * 가격을 볼 수 있어야 통과하므로 BILLING_ENABLED와 무관하게 항상 렌더한다. 버튼은 결제로
 * 바로 이어지지 않고 로그인으로 보낸다(체험·결제는 로그인 후 /premium에서).
 */
const PricingSection = () => {
  const navigate = useNavigate();
  const goToLogin = () => navigate("/login");

  return (
    <Section id="pricing" aria-labelledby="pricing-heading">
      <Heading id="pricing-heading">요금제</Heading>
      <Plans>
        <PlanCard aria-labelledby="plan-free">
          <PlanName id="plan-free">무료</PlanName>
          <PriceRow>
            <PlanPrice>0원</PlanPrice>
          </PriceRow>
          <FeatureList>
            {FREE_FEATURES.map((feature) => (
              <FeatureItem key={feature}>
                <Check size={16} aria-hidden="true" />
                <span>{feature}</span>
              </FeatureItem>
            ))}
          </FeatureList>
          <PlanButton type="button" $variant="secondary" onClick={goToLogin}>
            무료로 시작하기
          </PlanButton>
        </PlanCard>
        <PlanCard aria-labelledby="plan-premium" $highlighted>
          <PlanName id="plan-premium">프리미엄</PlanName>
          <PriceRow>
            <PlanPrice>{PREMIUM_MONTHLY_PRICE_LABEL}</PlanPrice>
            <PriceNote>부가세 포함</PriceNote>
          </PriceRow>
          <FeatureList>
            {PREMIUM_BENEFITS.map(({ icon: Icon, title, description }) => (
              <FeatureItem key={title}>
                <Icon size={16} aria-hidden="true" />
                <FeatureText>
                  <span>{title}</span>
                  <FeatureDescription>{description}</FeatureDescription>
                </FeatureText>
              </FeatureItem>
            ))}
          </FeatureList>
          <PlanButton type="button" $variant="primary" onClick={goToLogin}>
            7일 무료 체험 시작하기
          </PlanButton>
          <PlanHint>카드 등록 없이 · 계정당 1회</PlanHint>
        </PlanCard>
      </Plans>
      <Notes>
        <p>
          언제든 해지할 수 있어요 · 결제 후 14일 이내 전액 환불 (<Link to="/refund">환불 정책</Link>)
        </p>
        <p>결제는 Paddle이 처리합니다</p>
      </Notes>
    </Section>
  );
};

export default PricingSection;
