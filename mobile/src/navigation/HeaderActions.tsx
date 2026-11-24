import { StyleSheet, View } from "react-native";
import { Bell, UserRound } from "lucide-react-native";
import { IconButton } from "../shared/ui/iconButton/IconButton";
import { hasUnreadReminders, useReminderHistory } from "../reminders";
import { colors } from "../theme/colors";

interface HeaderActionsProps {
  navigate: (name: "Notifications" | "Account") => void;
  /** 알림 화면에서는 벨을 숨긴다. */
  showBell?: boolean;
}

/** 모든 스택 헤더 오른쪽: 알림(미읽음 점) + 계정. */
export const HeaderActions = ({ navigate, showBell = true }: HeaderActionsProps) => {
  const { data: history } = useReminderHistory();
  const unread = hasUnreadReminders(history);
  return (
    <View style={styles.row}>
      {showBell && (
        <View>
          <IconButton
            icon={Bell}
            accessibilityLabel={unread ? "알림, 읽지 않은 알림 있음" : "알림"}
            onPress={() => navigate("Notifications")}
          />
          {unread && <View testID="bell-unread-badge" pointerEvents="none" style={styles.badge} />}
        </View>
      )}
      <IconButton icon={UserRound} accessibilityLabel="계정" onPress={() => navigate("Account")} />
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger.main,
  },
});
