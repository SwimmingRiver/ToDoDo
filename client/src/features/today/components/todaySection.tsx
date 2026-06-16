import type { ReactNode } from "react";
import { Container, Title } from "./todaySection.styles";

interface TodaySectionProps {
  title: "진행 중" | "완료";
  children: ReactNode;
}

const TodaySection = ({ title, children }: TodaySectionProps) => {
  return (
    <Container>
      <Title>{title}</Title>
      {children}
    </Container>
  );
};

export default TodaySection;
