import type { LucideIcon } from "lucide-react";
import {
  Card,
  IconWrapper,
  TitleRow,
  CardTitle,
  CardDescription,
  Badge,
} from "./featureCard.styles";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** 전달된 경우에만 카드 타이틀 옆에 기대치 안내 배지를 노출 (예: "로그인 후 이용 가능"). */
  badgeLabel?: string;
}

const FeatureCard = ({
  icon: Icon,
  title,
  description,
  badgeLabel,
}: FeatureCardProps) => {
  return (
    <Card>
      <IconWrapper>
        <Icon size={20} aria-hidden="true" />
      </IconWrapper>
      <TitleRow>
        <CardTitle>{title}</CardTitle>
        {badgeLabel && <Badge>{badgeLabel}</Badge>}
      </TitleRow>
      <CardDescription>{description}</CardDescription>
    </Card>
  );
};

export default FeatureCard;
export type { FeatureCardProps };
