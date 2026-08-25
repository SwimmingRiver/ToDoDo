import { Pressable, StyleSheet, View } from "react-native";

interface ColorDotProps {
  /** 자식 카드: statusColors[status].main / 루트 카드: isOverdue ? danger.main : brand.fill */
  color: string;
  /** 없으면 순수 표시(터치 불가). ProjectCard/ChildTodoCard에서는 항상 상태변경 트리거로 쓰인다. */
  onPress?: () => void;
  /** "프로젝트 상태 변경" | "할 일 상태 변경" (웹 aria-label과 동일 문구) */
  accessibilityLabel: string;
  testID?: string;
}

/**
 * 웹 ProjectCard/ChildTodoCard의 8px 원형 ColorDot에 대응. 시각적으로는 8px 점이지만
 * 터치 타겟은 hitSlop으로 44px에 맞춘다(점 자체를 44px로 키우면 카드 레이아웃이
 * 웹과 달라지므로, 히트 영역만 확장하는 방식을 택했다).
 */
export const ColorDot = ({ color, onPress, accessibilityLabel, testID }: ColorDotProps) => {
  const dot = <View style={[styles.dot, { backgroundColor: color }]} />;

  if (!onPress) {
    return dot;
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={18}
    >
      {dot}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
});
