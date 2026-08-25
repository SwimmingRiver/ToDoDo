import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "../../../theme/colors";
import { MIN_TOUCH_TARGET, spacing } from "../../../theme/spacing";

export interface BottomSheetOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface BottomSheetProps<T extends string> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: BottomSheetOption<T>[];
  selectedValue?: T;
  onSelect: (value: T) => void;
}

/**
 * 웹 shared/ui/bottomSheet/bottomSheet.tsx와 동일한 옵션 리스트 UI를 RN Modal로
 * 재현한다. Modal의 내장 slide 애니메이션을 그대로 쓴다 — 직접 Animated 상태로
 * 마운트/언마운트 타이밍을 관리하면 테스트 환경(act() 플러시 타이밍)에서 상태 갱신이
 * 한 프레임 늦게 반영되어 열림 직후 옵션을 바로 못 찾는 문제가 있었다.
 */
export const BottomSheet = <T extends string>({
  isOpen,
  onClose,
  title,
  options,
  selectedValue,
  onSelect,
}: BottomSheetProps<T>) => {
  const handleSelect = (value: T) => {
    onSelect(value);
    onClose();
  };

  return (
    <Modal transparent animationType="slide" visible={isOpen} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="닫기">
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
          </View>
          <View style={styles.content}>
            {options.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => handleSelect(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.option,
                    selected && styles.optionSelected,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <View style={styles.optionLabel}>
                    {option.icon}
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {option.label}
                    </Text>
                  </View>
                  {selected && <Check size={20} color={colors.brand.strong} />}
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="취소"
            style={({ pressed }) => [styles.cancel, pressed && styles.cancelPressed]}
          >
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "80%",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border.tertiary,
    borderRadius: 2,
    alignSelf: "center",
    marginVertical: spacing.md,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.tertiary,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text.primary,
    textAlign: "center",
  },
  content: {
    paddingVertical: spacing.sm,
  },
  option: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 20,
    paddingVertical: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionSelected: {
    backgroundColor: colors.brand.tint,
  },
  optionPressed: {
    backgroundColor: colors.background.secondary,
  },
  optionLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  optionText: {
    fontSize: 16,
    color: colors.text.primary,
  },
  optionTextSelected: {
    color: colors.brand.strong,
    fontWeight: "600",
  },
  cancel: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border.tertiary,
  },
  cancelPressed: {
    backgroundColor: colors.background.secondary,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.text.secondary,
  },
});
