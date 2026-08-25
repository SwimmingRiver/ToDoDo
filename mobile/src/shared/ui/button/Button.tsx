import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../../../theme/colors";
import { MIN_TOUCH_TARGET, radius } from "../../../theme/spacing";

export type ButtonVariant = "primary" | "outline" | "text";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * 웹 하단 고정 AddButton(brand.strong, 풀폭, 48px, radius 10)과 로그인 버튼(outline) 두
 * 형태를 하나의 컴포넌트로 흡수한다. variant="text"는 폼의 "더보기/간단히" 토글용.
 */
export const Button = ({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}: ButtonProps) => {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "outline" && styles.outline,
        variant === "text" && styles.text,
        pressed && !isDisabled && variant === "primary" && styles.primaryPressed,
        pressed && !isDisabled && variant === "outline" && styles.outlinePressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading && variant === "primary" ? (
        <ActivityIndicator color={colors.background.primary} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === "primary" && styles.primaryLabel,
            variant === "outline" && styles.outlineLabel,
            variant === "text" && styles.textLabel,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primary: {
    backgroundColor: colors.brand.strong,
    borderRadius: radius.lg,
    width: "100%",
    height: 48,
  },
  primaryPressed: {
    backgroundColor: colors.brand.strongHover,
  },
  outline: {
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.border.secondary,
    borderRadius: radius.md,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  outlinePressed: {
    backgroundColor: colors.background.secondary,
  },
  text: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  primaryLabel: {
    color: colors.background.primary,
  },
  outlineLabel: {
    color: colors.text.secondary,
    fontWeight: "500",
    fontSize: 15,
  },
  textLabel: {
    color: colors.brand.strong,
  },
});
