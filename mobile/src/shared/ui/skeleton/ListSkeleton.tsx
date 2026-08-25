import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors } from "../../../theme/colors";
import { radius, spacing } from "../../../theme/spacing";

interface ListSkeletonProps {
  count?: number;
}

const WIDTHS: `${number}%`[] = ["75%", "60%", "80%", "55%", "70%"];

/**
 * ActivityIndicator 단독 대신 쓰는 카드형 skeleton row. 웹 CheckboxSkeleton과 같은
 * 역할(빈 화면 깜빡임 최소화)이지만, 체크박스 특수 애니메이션까지는 이식하지 않고
 * opacity pulse로 "로딩 중" 신호만 담당한다.
 */
export const ListSkeleton = ({ count = 4 }: ListSkeletonProps) => {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={styles.container} testID="list-skeleton">
      {Array.from({ length: count }, (_, index) => (
        <Animated.View key={index} style={[styles.row, { opacity }]}>
          <View style={styles.circle} />
          <View style={styles.textGroup}>
            <View style={[styles.bar, { width: WIDTHS[index % WIDTHS.length] }]} />
            <View style={[styles.bar, styles.subBar, { width: "40%" }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background.primary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.tertiary,
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.border.tertiary,
  },
  textGroup: {
    flex: 1,
    gap: spacing.sm,
  },
  bar: {
    height: 14,
    borderRadius: 4,
    backgroundColor: colors.border.tertiary,
  },
  subBar: {
    height: 10,
  },
});
