import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";

const CARD_HEIGHTS = [72, 120, 96, 160];

/** 카드 모양 회색 블록 + opacity pulse. ListSkeleton과 같은 패턴. */
export const InsightsSkeleton = () => {
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
    <View style={styles.container} testID="insights-skeleton">
      {CARD_HEIGHTS.map((height, index) => (
        <Animated.View key={index} testID="insights-skeleton-card" style={[styles.card, { height, opacity }]} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.tertiary,
    backgroundColor: colors.border.tertiary,
  },
});
