import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../../../theme/colors";
import { radius, spacing } from "../../../theme/spacing";

interface CardProps {
  children: React.ReactNode;
  /** 좌측 보더 색(상태색). 지정하지 않으면 보더 없이 렌더링한다. */
  borderColor?: string;
  isChild?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * 웹 TodoListItemContainer(흰 배경, radius 12, 좌측 보더 4px, 내부 패딩 10px,
 * 자식은 28px 좌측 패딩)에 대응하는 RN 카드.
 */
export const Card = ({ children, borderColor, isChild = false, style, testID }: CardProps) => {
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        borderColor ? { borderLeftColor: borderColor, borderLeftWidth: 4 } : null,
        isChild && styles.child,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.border.tertiary,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  child: {
    // 웹 TodoListItemContainer의 자식 좌측 들여쓰기(28px)와 동일한 값.
    marginLeft: 28,
  },
});
