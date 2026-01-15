import {
  Container,
  SkeletonItem,
  CheckboxWrapper,
  CheckboxBase,
  CheckMark,
  TextGroup,
  SkeletonText,
  SkeletonSubText,
} from "./checkboxSkeleton.styles";

interface CheckboxSkeletonProps {
  count?: number;
}

const CheckboxSkeleton = ({ count = 4 }: CheckboxSkeletonProps) => {
  const items = Array.from({ length: count }, (_, i) => i);
  const widths = ["75%", "60%", "80%", "55%", "70%"];

  return (
    <Container>
      {items.map((index) => (
        <SkeletonItem key={index} $delay={index * 0.3}>
          <CheckboxWrapper $delay={index * 0.3}>
            <CheckboxBase />
            <CheckMark $delay={index * 0.3} viewBox="0 0 20 20">
              <path className="check-path" d="M4 10 L8 14 L16 6" />
            </CheckMark>
          </CheckboxWrapper>
          <TextGroup>
            <SkeletonText $width={widths[index % widths.length]} $delay={index} />
            <SkeletonSubText $width="40%" $delay={index} />
          </TextGroup>
        </SkeletonItem>
      ))}
    </Container>
  );
};

export default CheckboxSkeleton;
