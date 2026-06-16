import {
  Container,
  SkeletonItem,
  CheckboxCircle,
  TextGroup,
  SkeletonText,
  SkeletonSubText,
} from "./todayItemSkeleton.styles";

interface TodayItemSkeletonProps {
  count?: number;
}

const TodayItemSkeleton = ({ count = 3 }: TodayItemSkeletonProps) => {
  const items = Array.from({ length: count }, (_, i) => i);
  const widths = ["70%", "55%", "65%", "45%"];

  return (
    <Container>
      {items.map((index) => (
        <SkeletonItem key={index}>
          <CheckboxCircle $delay={index * 0.2} />
          <TextGroup>
            <SkeletonText $width={widths[index % widths.length]} $delay={index} />
            <SkeletonSubText $width="35%" $delay={index} />
          </TextGroup>
        </SkeletonItem>
      ))}
    </Container>
  );
};

export default TodayItemSkeleton;
