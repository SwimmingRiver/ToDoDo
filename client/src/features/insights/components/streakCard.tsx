import { Flame } from "lucide-react";
import { Card, IconWrapper, Content, Value, Label, Caption } from "./streakCard.styles";

interface StreakCardProps {
  streak: number;
}

/** 스트릭은 기간/프로젝트 필터와 무관하게 항상 전체 기준이라 캡션으로 알린다. */
const StreakCard = ({ streak }: StreakCardProps) => {
  return (
    <Card>
      <IconWrapper>
        <Flame size={20} aria-hidden="true" />
      </IconWrapper>
      <Content>
        <Value>{streak}일</Value>
        <Label>{streak > 0 ? "연속 완료 중" : "오늘부터 시작해보세요"}</Label>
        <Caption>전체 기간 기준</Caption>
      </Content>
    </Card>
  );
};

export default StreakCard;
export type { StreakCardProps };
