import {
  Container,
  StreakBar,
  CardsGrid,
  CardBar,
  SecondaryGrid,
  SecondaryBar,
} from "./insightsSkeleton.styles";

const SUMMARY_CARD_COUNT = 5;

const InsightsSkeleton = () => (
  <Container aria-hidden="true">
    <StreakBar />
    <CardsGrid>
      {Array.from({ length: SUMMARY_CARD_COUNT }, (_, i) => (
        <CardBar key={i} />
      ))}
    </CardsGrid>
    <SecondaryGrid>
      <SecondaryBar />
      <SecondaryBar />
    </SecondaryGrid>
  </Container>
);

export default InsightsSkeleton;
