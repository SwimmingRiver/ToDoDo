import {
  Container,
  Column,
  ColumnHeader,
  Card,
  CardCheckbox,
  CardContent,
  CardTitle,
  CardSubtitle,
  MobileContainer,
} from "./kanbanSkeleton.styles";

interface KanbanSkeletonProps {
  mobile?: boolean;
}

const cardWidths = ["80%", "65%", "90%", "55%", "75%"];

const SkeletonCard = ({ index }: { index: number }) => (
  <Card $delay={index * 0.2}>
    <CardCheckbox $delay={index * 0.2} />
    <CardContent>
      <CardTitle $width={cardWidths[index % cardWidths.length]} />
      <CardSubtitle $width="40%" />
    </CardContent>
  </Card>
);

const KanbanSkeleton = ({ mobile = false }: KanbanSkeletonProps) => {
  if (mobile) {
    return (
      <MobileContainer>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} index={i} />
        ))}
      </MobileContainer>
    );
  }

  return (
    <Container>
      <Column>
        <ColumnHeader />
        <SkeletonCard index={0} />
        <SkeletonCard index={1} />
        <SkeletonCard index={2} />
      </Column>
      <Column>
        <ColumnHeader />
        <SkeletonCard index={3} />
        <SkeletonCard index={4} />
      </Column>
      <Column>
        <ColumnHeader />
        <SkeletonCard index={5} />
      </Column>
    </Container>
  );
};

export default KanbanSkeleton;
