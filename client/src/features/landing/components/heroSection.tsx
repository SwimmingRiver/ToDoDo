import CtaButtons from "./ctaButtons";
import { Section, TextGroup, Title, Subtitle } from "./heroSection.styles";

interface HeroSectionProps {
  onPrimaryClick: () => void;
  onSecondaryClick: () => void;
}

const HeroSection = ({ onPrimaryClick, onSecondaryClick }: HeroSectionProps) => {
  return (
    <Section>
      <TextGroup>
        <Title>해야 할 일, 오늘 안에 끝내는 가장 쉬운 방법</Title>
        <Subtitle>Today 리스트·칸반보드·캘린더로 할 일을 한눈에</Subtitle>
      </TextGroup>
      <CtaButtons
        onPrimaryClick={onPrimaryClick}
        onSecondaryClick={onSecondaryClick}
      />
    </Section>
  );
};

export default HeroSection;
