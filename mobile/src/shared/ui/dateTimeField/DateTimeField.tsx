import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { ChevronRight, X } from "lucide-react-native";
import { colors } from "../../../theme/colors";
import { Button } from "../button/Button";
import { MIN_TOUCH_TARGET, radius, spacing } from "../../../theme/spacing";

interface DateTimeFieldProps {
  label: string;
  /** ISO(UTC "Z") 문자열. */
  value: string | null;
  /** UTC ISO 문자열 또는 null(클리어)을 그대로 전달한다. */
  onChange: (isoString: string | null) => void;
  placeholder?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 표시 포맷: YYYY.MM.DD HH:mm (24시간제). 웹 datetime-local과 정보 밀도를 맞춘다. */
const formatDisplay = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatAccessibilityValue = (label: string, iso: string | null): string => {
  if (!iso) return `${label}, 선택 안 함`;
  const d = new Date(iso);
  const hours24 = d.getHours();
  const period = hours24 < 12 ? "오전" : "오후";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${label}, ${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${period} ${hours12}시 ${d.getMinutes()}분`;
};

/**
 * 탭형 필드 + 네이티브 날짜/시간 피커. iOS는 모달(spinner)에 확인/취소를 붙여
 * 바텀시트 언어와 통일감을 주고, Android는 OS 관례대로 날짜 다이얼로그 →
 * 시간 다이얼로그가 순차로 뜬다(DateTimePickerAndroid.open 두 번 호출).
 * 값은 항상 Date.toISOString()(UTC "Z")으로만 전달한다 — 로컬 문자열을 자르거나
 * 조합하지 않는다.
 */
export const DateTimeField = ({ label, value, onChange, placeholder = "날짜·시간 선택" }: DateTimeFieldProps) => {
  const [iosModalVisible, setIosModalVisible] = useState(false);
  const [iosPendingDate, setIosPendingDate] = useState<Date>(() => (value ? new Date(value) : new Date()));

  const openPicker = () => {
    const base = value ? new Date(value) : new Date();

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        onChange: (dateEvent, selectedDate) => {
          if (dateEvent.type !== "set" || !selectedDate) return;
          DateTimePickerAndroid.open({
            value: base,
            mode: "time",
            is24Hour: true,
            onChange: (timeEvent, selectedTime) => {
              if (timeEvent.type !== "set" || !selectedTime) return;
              const combined = new Date(selectedDate);
              combined.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
              onChange(combined.toISOString());
            },
          });
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
    onChange(iosPendingDate.toISOString());
    setIosModalVisible(false);
  };

  const cancelIos = () => {
    setIosModalVisible(false);
  };

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={formatAccessibilityValue(label, value)}
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
      >
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
        {value ? (
          <Pressable
            onPress={handleClear}
            accessibilityRole="button"
            accessibilityLabel={`${label} 지우기`}
            hitSlop={8}
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
                mode="datetime"
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
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
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
  fieldPressed: {
    backgroundColor: colors.background.secondary,
  },
  placeholderText: {
    fontSize: 14,
    color: colors.text.tertiary,
  },
  valueText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  clearButton: {
    width: MIN_TOUCH_TARGET / 2,
    height: MIN_TOUCH_TARGET / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
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
  iosSheetTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
    textAlign: "center",
  },
  iosSheetActions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  iosActionButton: {
    // Button "primary"의 기본 width:"100%"를 flex 행 레이아웃 안에서 무시하고
    // 절반씩 나눠 갖도록 flexBasis로 주 축 크기를 명시적으로 재정의한다.
    flexGrow: 1,
    flexBasis: 0,
  },
});
