import { Pressable, StyleSheet } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors } from "../../../theme/colors";
import { MIN_TOUCH_TARGET, radius } from "../../../theme/spacing";

interface IconButtonProps {
  icon: LucideIcon;
  onPress: () => void;
  /** 웹 aria-label과 동일한 문구를 그대로 사용한다. */
  accessibilityLabel: string;
  variant?: "default" | "danger";
  disabled?: boolean;
  testID?: string;
}

export const IconButton = ({
  icon: Icon,
  onPress,
  accessibilityLabel,
  variant = "default",
  disabled = false,
  testID,
}: IconButtonProps) => {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        pressed && (variant === "danger" ? styles.dangerPressed : styles.defaultPressed),
        disabled && styles.disabled,
      ]}
    >
      <Icon
        size={18}
        color={variant === "danger" ? colors.danger.text : colors.text.secondary}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  defaultPressed: {
    backgroundColor: colors.background.secondary,
  },
  dangerPressed: {
    backgroundColor: colors.danger.background,
  },
  disabled: {
    opacity: 0.5,
  },
});
