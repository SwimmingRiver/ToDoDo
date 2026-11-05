import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { ChevronRight, X } from "lucide-react-native";
import { colors } from "../../../theme/colors";
import { Button } from "../button/Button";
import { MIN_TOUCH_TARGET, radius, spacing } from "../../../theme/spacing";

interface DateFieldProps {
  label: string;
  /** "YYYY-MM-DD" 로컬 날짜 키. */
  value: string | null;
  /** "YYYY-MM-DD" 로컬 날짜 키 또는 null(클리어). */
  onChange: (dateKey: string | null) => void;
  placeholder?: string;
}

const CLEAR_SIZE = MIN_TOUCH_TARGET / 2;
/** 지우기 버튼의 실제 터치 영역(박스 + hitSlop 양쪽)이 MIN_TOUCH_TARGET 이상이 되도록 유도한다. */
const CLEAR_HIT_SLOP = (MIN_TOUCH_TARGET - CLEAR_SIZE) / 2;

const pad = (n: number) => String(n).padStart(2, "0");

/** 선택한 Date의 로컬 연·월·일로 키를 만든다. ISO(UTC)로 바꿔 자르지 않는다. */
const toLocalKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "YYYY-MM-DD"를 로컬 자정 Date로. 형식이 다르면 오늘. */
const fromKey = (key: string | null): Date => {
  const m = key ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(key) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
};

/**
 * 날짜만 고르는 필드(시각 없음). iOS는 DateTimeField처럼 모달 spinner + 확인/취소,
 * Android는 날짜 다이얼로그 하나만 띄운다.
 */
export const DateField = ({ label, value, onChange, placeholder = "날짜 선택" }: DateFieldProps) => {
  const [iosModalVisible, setIosModalVisible] = useState(false);
  const [iosPendingDate, setIosPendingDate] = useState<Date>(() => fromKey(value));

  const openPicker = () => {
    const base = fromKey(value);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        onChange: (event, selectedDate) => {
          if (event.type !== "set" || !selectedDate) return;
          onChange(toLocalKey(selectedDate));
        },
      });
      return;
    }
    setIosPendingDate(base);
    setIosModalVisible(true);
  };

  const handleClear = (event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
    onChange(null);
  };

  const confirmIos = () => {
    onChange(toLocalKey(iosPendingDate));
    setIosModalVisible(false);
  };

  const cancelIos = () => setIosModalVisible(false);

  return (
    <View>
      <Pressable
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ?? "선택 안 함"}`}
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
      >
        <Text style={value ? styles.valueText : styles.placeholderText}>{value ?? placeholder}</Text>
        {value ? (
          <Pressable
            onPress={handleClear}
            accessibilityRole="button"
            accessibilityLabel={`${label} 지우기`}
            hitSlop={CLEAR_HIT_SLOP}
            style={styles.clearButton}
          >
            <X size={16} color={colors.text.tertiary} />
          </Pressable>
        ) : (
          <ChevronRight size={16} color={colors.text.tertiary} />
        )}
      </Pressable>

      {Platform.OS === "ios" && (
        <Modal transparent animationType="slide" visible={iosModalVisible} onRequestClose={cancelIos}>
          <Pressable style={styles.overlay} onPress={cancelIos}>
            <Pressable style={styles.iosSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.iosSheetHeader}>
                <Text style={styles.iosSheetTitle}>{label}</Text>
              </View>
              <DateTimePicker
                value={iosPendingDate}
                mode="date"
                display="spinner"
                onChange={(_event, selectedDate) => {
                  if (selectedDate) setIosPendingDate(selectedDate);
                }}
              />
              <View style={styles.iosSheetActions}>
                <Button title="취소" onPress={cancelIos} variant="outline" style={styles.iosActionButton} />
                <Button title="확인" onPress={confirmIos} variant="primary" style={styles.iosActionButton} />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  field: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.secondary,
    borderRadius: radius.sm,
    backgroundColor: colors.background.primary,
  },
  fieldPressed: { backgroundColor: colors.background.secondary },
  placeholderText: { fontSize: 14, color: colors.text.tertiary },
  valueText: { fontSize: 14, color: colors.text.primary },
  clearButton: {
    width: CLEAR_SIZE,
    height: CLEAR_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "flex-end" },
  iosSheet: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: spacing.xl,
  },
  iosSheetHeader: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.tertiary,
  },
  iosSheetTitle: { fontSize: 16, fontWeight: "600", color: colors.text.primary, textAlign: "center" },
  iosSheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  iosActionButton: { flexGrow: 1, flexBasis: 0 },
});
