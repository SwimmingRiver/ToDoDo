import { Pressable, StyleSheet } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "../../../theme/colors";
import { MIN_TOUCH_TARGET, radius } from "../../../theme/spacing";

interface CheckboxProps {
  checked: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
}

/** 완료/미완료 이진 토글. 상태 3단 순환용 ColorDot과는 별개 컴포넌트다. */
export const Checkbox = ({ checked, onPress, accessibilityLabel, testID }: CheckboxProps) => {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={[styles.base, checked && styles.checked]}
    >
      {checked && <Check size={14} color={colors.background.primary} />}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    width: 22,
    height: 22,
    minWidth: MIN_TOUCH_TARGET / 2,
    minHeight: MIN_TOUCH_TARGET / 2,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: {
    backgroundColor: colors.brand.strong,
    borderColor: colors.brand.strong,
  },
});
