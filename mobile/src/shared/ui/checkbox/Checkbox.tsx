import { Pressable, StyleSheet } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "../../../theme/colors";

interface CheckboxProps {
  checked: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  /** 미완료 상태의 링 색. 웹 오늘 화면처럼 마감 임박·지남을 링 색으로 알릴 때 쓴다. */
  ringColor?: string;
  testID?: string;
}

/**
 * 완료/미완료 이진 토글. 상태 3단 순환용 ColorDot과는 별개 컴포넌트다.
 * 웹 오늘 화면(todayTodoItem.styles.tsx Checkbox)과 같은 18px 원형 — 보이는 원은 작지만
 * hitSlop으로 44px 터치 타겟을 확보한다.
 */
export const Checkbox = ({
  checked,
  onPress,
  accessibilityLabel,
  ringColor = colors.border.secondary,
  testID,
}: CheckboxProps) => {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={13}
      style={[styles.base, checked ? styles.checked : { borderColor: ringColor }]}
    >
      {checked && <Check size={12} color={colors.background.primary} strokeWidth={3} />}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: {
    backgroundColor: colors.brand.fill,
    borderColor: "transparent",
  },
});
