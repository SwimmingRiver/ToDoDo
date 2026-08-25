import { Pressable, StyleSheet, Text, View } from "react-native";
import { Circle, Loader, CheckCircle, ChevronDown } from "lucide-react-native";
import { statusColors, type Status } from "../../../theme/statusColors";
import { colors } from "../../../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../../../theme/spacing";

interface StatusChipProps {
  status: Status;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

const STATUS_LABEL: Record<Status, string> = {
  todo: "할 일",
  doing: "진행 중",
  done: "완료",
};

const STATUS_ICON: Record<Status, typeof Circle> = {
  todo: Circle,
  doing: Loader,
  done: CheckCircle,
};

/**
 * 웹 StatusSelect(상태 아이콘+라벨+chevron)와 동일한 시각 언어. 탭하면 상위(TodoRow)가
 * BottomSheet를 연다 — 의사결정 확정 2번(탭→바텀시트 3택)에 따라 사이클 토글이 아니라
 * 항상 바텀시트를 통해서만 상태가 바뀐다.
 */
export const StatusChip = ({ status, onPress, disabled, testID }: StatusChipProps) => {
  const Icon = STATUS_ICON[status];
  const color = statusColors[status].main;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`상태: ${STATUS_LABEL[status]}`}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon size={14} color={color} />
      <Text style={[styles.label, { color }]}>{STATUS_LABEL[status]}</Text>
      <ChevronDown size={14} color={colors.text.tertiary} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.tertiary,
    borderRadius: radius.sm,
  },
  pressed: {
    backgroundColor: colors.border.tertiary,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
});
