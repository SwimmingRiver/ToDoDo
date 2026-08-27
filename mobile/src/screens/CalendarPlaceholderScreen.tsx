import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

/** 캘린더 탭 자리표시자. 실제 구현은 후속 계획(react-native-calendars 도입)에서 교체한다. */
export const CalendarPlaceholderScreen = () => (
  <SafeAreaView style={styles.screen}>
    <View style={styles.center}>
      <Text style={styles.text}>캘린더는 준비 중입니다</Text>
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background.secondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 14, color: colors.text.secondary },
});
