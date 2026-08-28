import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar } from "react-native-calendars";
import { colors } from "../theme/colors";

/**
 * 캘린더 탭. Task 5에서 마커/날짜 탭 인터랙션을 채운다.
 * react-native-calendars의 `Calendar`(월간 뷰)만 우선 렌더링해 의존성 로딩을 검증한다.
 */
export const CalendarScreen = () => (
  <SafeAreaView style={styles.screen} edges={[]}>
    <Calendar />
  </SafeAreaView>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.secondary,
  },
});
