import { Sun, LayoutGrid, CalendarDays } from "lucide-react";
import FeatureCard from "./featureCard";
import { Grid } from "./featureGrid.styles";

const LOGIN_REQUIRED_BADGE = "로그인 후 이용 가능";

const FEATURES = [
  {
    icon: Sun,
    title: "Today",
    description: "오늘 할 일만 모아보고, 체크 한 번으로 완료",
  },
  {
    icon: LayoutGrid,
    title: "칸반보드",
    description: "드래그 앤 드롭으로 진행 상태를 관리",
    badgeLabel: LOGIN_REQUIRED_BADGE,
  },
  {
    icon: CalendarDays,
    title: "캘린더",
    description: "마감일과 반복 일정을 한눈에 확인",
    badgeLabel: LOGIN_REQUIRED_BADGE,
  },
] as const;

/**
 * Today는 게스트 모드에서도 체험 가능하지만, 칸반/캘린더는 로그인 후에만 이용 가능하므로
 * 배지로 기대치를 명확히 한다.
 */
const FeatureGrid = () => {
  return (
    <Grid>
      {FEATURES.map((feature) => (
        <FeatureCard
          key={feature.title}
          icon={feature.icon}
          title={feature.title}
          description={feature.description}
          badgeLabel={"badgeLabel" in feature ? feature.badgeLabel : undefined}
        />
      ))}
    </Grid>
  );
};

export default FeatureGrid;
