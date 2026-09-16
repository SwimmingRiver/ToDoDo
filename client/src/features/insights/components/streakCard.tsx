import { Flame } from "lucide-react";
import { Card, IconWrapper, Content, Value, Label } from "./streakCard.styles";

interface StreakCardProps {
  streak: number;
}

const StreakCard = ({ streak }: StreakCardProps) => {
  return (
    <Card>
      <IconWrapper>
        <Flame size={20} aria-hidden="true" />
      </IconWrapper>
      <Content>
        <Value>{streak}일</Value>
        <Label>{streak > 0 ? "연속 완료 중" : "오늘부터 시작해보세요"}</Label>
      </Content>
    </Card>
  );
};

export default StreakCard;
export type { StreakCardProps };
