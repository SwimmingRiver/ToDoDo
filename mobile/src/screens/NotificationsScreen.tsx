import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { BellOff } from "lucide-react-native";
import {
  REMINDER_SETTING_OPTIONS,
  formatTimeAgo,
  parseReminderSetting,
  reminderBody,
} from "@tododo/core/dist/reminders/index.js";
import { useAuthState } from "../auth/useAuthState";
import {
  enablePushOnThisDevice,
  getPushPermission,
  subscribePushPermissionChanged,
  useMarkHistorySeen,
  useReminderDefault,
  useReminderHistory,
  useSetReminderDefault,
  type PushPermission,
  type ReminderHistoryItem,
} from "../reminders";
import { openTodoDetail } from "../navigation/navigationRef";
import { reportError } from "../shared/lib/sentry";
import { Button } from "../shared/ui/button/Button";
import { EmptyState } from "../shared/ui/emptyState/EmptyState";
import { ReminderChips } from "../shared/ui/reminderField/ReminderField";
import { colors } from "../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../theme/spacing";

type Nav = {
  navigate: (name: "TodoDetail", params: { id: string }) => void;
  getState: () => { routeNames: string[] };
};

export const NotificationsScreen = () => {
  const navigation = useNavigation<Nav>();
  const { user } = useAuthState();
  const uid = user?.uid;
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [enabling, setEnabling] = useState(false);
  const { data: defaultSetting } = useReminderDefault();
  const setDefault = useSetReminderDefault();
  const { data: history } = useReminderHistory();
  const markSeen = useMarkHistorySeen();
  // 이 기기의 푸시는 iOS 전용이다. Android는 messaging이 구성되지 않아 권한을 읽지 않고 기록·기본값만 보여 준다.
  const devicePushSupported = Platform.OS === "ios";

  const refreshPermission = useCallback(() => {
    getPushPermission()
      .then(setPermission)
      .catch((error) => reportError(error, "reminder"));
  }, []);

  useEffect(() => {
    if (!devicePushSupported) return;
    refreshPermission();
    const unsubscribe = subscribePushPermissionChanged(refreshPermission);
    // iOS 설정 앱에서 돌아오면 권한이 바뀌어 있을 수 있다.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermission();
    });
    return () => {
      unsubscribe();
      sub.remove();
    };
  }, [refreshPermission, devicePushSupported]);

  // 화면에 들어온 시점의 lastSeenAt을 기억해, 읽음 처리 후에도 이번에 새로 온 항목의 점을 유지한다.
  const seenAtEntry = useRef<number | null>(null);
  const requestedSeen = useRef(0);
  useFocusEffect(
    useCallback(
      () => () => {
        seenAtEntry.current = null;
      },
      [],
    ),
  );
  const mutateSeen = markSeen.mutate;
  useFocusEffect(
    useCallback(() => {
      if (!history || history.items.length === 0) return;
      if (seenAtEntry.current === null) seenAtEntry.current = history.lastSeenAt;
      const maxSentAt = Math.max(...history.items.map((i) => i.sentAt));
      // 실패 후 롤백으로 다시 이 효과가 돌아도 같은 값을 반복 요청하지 않는다.
      if (maxSentAt > history.lastSeenAt && maxSentAt > requestedSeen.current) {
        requestedSeen.current = maxSentAt;
        mutateSeen(maxSentAt);
      }
    }, [history, mutateSeen]),
  );

  const handleEnable = async () => {
    if (!uid) return;
    setEnabling(true);
    try {
      setPermission(await enablePushOnThisDevice(uid));
    } catch (error) {
      reportError(error, "reminder");
    } finally {
      setEnabling(false);
    }
  };

  const openItem = (todoId: string) => {
    // 통계 스택에는 TodoDetail이 없어 오늘 탭으로 보낸다.
    if (navigation.getState().routeNames.includes("TodoDetail")) {
      navigation.navigate("TodoDetail", { id: todoId });
    } else {
      openTodoDetail(todoId);
    }
  };

  const selectedValue = defaultSetting === undefined ? null : String(defaultSetting);
  const unreadAfter = seenAtEntry.current ?? history?.lastSeenAt ?? 0;
  const now = Date.now();

  const renderItem = ({ item }: { item: ReminderHistoryItem }) => (
    <Pressable
      onPress={() => openItem(item.todoId)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <View style={styles.dotSlot}>{item.sentAt > unreadAfter && <View style={styles.dot} />}</View>
      <View style={styles.itemText}>
        <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.itemBody}>{reminderBody(item.offsetMinutes)}</Text>
      </View>
      <Text style={styles.itemTime}>{formatTimeAgo(item.sentAt, now)}</Text>
    </Pressable>
  );

  const header = (
    <View style={styles.headerWrap}>
      {devicePushSupported && (
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <Text style={styles.label}>푸시 알림</Text>
            {permission === "granted" && <Text style={styles.statusOn}>알림 켜짐</Text>}
            {permission === "undetermined" && (
              <Button title="켜기" onPress={handleEnable} loading={enabling} style={styles.smallButton} />
            )}
            {permission === "denied" && (
              <Button
                title="iOS 설정 열기"
                variant="outline"
                onPress={() => void Linking.openSettings()}
                style={styles.smallButton}
              />
            )}
          </View>
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.label}>기본 알림 시점</Text>
        <ReminderChips
          options={REMINDER_SETTING_OPTIONS}
          value={selectedValue}
          onChange={(value) => {
            const setting = parseReminderSetting(value);
            if (setting !== null) setDefault.mutate(setting);
          }}
          accessibilityPrefix="기본 알림 시점"
        />
      </View>
      <Text style={styles.sectionTitle}>받은 알림</Text>
    </View>
  );

  const items = history?.items ?? [];
  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <FlatList
        data={items}
        keyExtractor={(item) => `${item.todoId}-${item.offsetMinutes}-${item.sentAt}`}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          history ? (
            <EmptyState icon={BellOff} title="아직 받은 알림이 없어요" description="마감이 가까운 할 일이 있으면 여기에 알림 기록이 쌓여요." />
          ) : null
        }
        contentContainerStyle={styles.content}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.secondary },
  content: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  headerWrap: { gap: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.background.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 14, color: colors.text.secondary },
  statusOn: { fontSize: 15, fontWeight: "600", color: colors.brand.strong },
  smallButton: { minWidth: 120 },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: colors.text.secondary },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.background.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  itemPressed: { backgroundColor: colors.background.secondary },
  dotSlot: { width: 8, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger.main },
  itemText: { flex: 1, gap: spacing.xs },
  itemTitle: { fontSize: 16, color: colors.text.primary },
  itemBody: { fontSize: 13, color: colors.text.secondary },
  itemTime: { fontSize: 12, color: colors.text.tertiary },
});
