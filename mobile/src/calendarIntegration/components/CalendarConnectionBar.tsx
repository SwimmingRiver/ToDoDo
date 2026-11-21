import { useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Todo } from "@tododo/core";
import type { CalendarStackParamList } from "../../navigation/types";
import { useAuthState } from "../../auth/useAuthState";
import { useIsPremium } from "../../premium";
import { Button } from "../../shared/ui/button/Button";
import { colors } from "../../theme/colors";
import { MIN_TOUCH_TARGET, spacing } from "../../theme/spacing";
import {
  useCalendarIntegrationStatus,
  useConnectCalendar,
  useDisconnectCalendar,
  type ConnectCalendarResult,
} from "../useCalendarIntegration";
import { findOrphanGoogleEventIds, loadSnapshot } from "../snapshotStorage";

interface CalendarConnectionBarProps {
  /** 해제 시 Firestore에서 googleEventId를 지울 대상. 화면이 이미 들고 있는 목록을 받는다. */
  todos: Todo[];
}

const CONNECT_ALERTS: Partial<Record<ConnectCalendarResult, [string, string]>> = {
  connected: ["연동 완료", "구글 캘린더 연동이 완료됐습니다"],
  error: ["연동 실패", "구글 캘린더 연동 중 오류가 발생했습니다"],
  saveFailed: ["연동 상태 저장 실패", "구글 캘린더를 다시 연결해주세요"],
};

/**
 * 캘린더 화면 상단의 구글 캘린더 연동 줄(웹 CalendarConnectionButton 대응).
 * 무료는 잠금 안내, 프리미엄은 연동/해제 버튼. 결제 문구·링크는 두지 않고 계정 화면으로만
 * 보낸다(Apple 3.1.1).
 */
export const CalendarConnectionBar = ({ todos }: CalendarConnectionBarProps) => {
  const navigation = useNavigation<NativeStackNavigationProp<CalendarStackParamList>>();
  const { user } = useAuthState();
  const { isPremium, isLoading: isEntitlementLoading } = useIsPremium();
  const { data: integration, isLoading: isStatusLoading } = useCalendarIntegrationStatus();
  const { connect } = useConnectCalendar();
  const { disconnect } = useDisconnectCalendar();
  // 상태는 다음 렌더에야 반영돼 연타 두 번째 탭이 통과할 수 있다 — ref로 즉시 막는다.
  const pendingRef = useRef(false);
  const [isPending, setIsPending] = useState(false);

  const runExclusive = async (task: () => Promise<void>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsPending(true);
    try {
      await task();
    } finally {
      pendingRef.current = false;
      setIsPending(false);
    }
  };

  const handleConnect = () =>
    runExclusive(async () => {
      let result: ConnectCalendarResult;
      try {
        result = await connect();
      } catch (error) {
        console.warn("[calendar] 연동 실패", error);
        result = "error";
      }
      const alert = CONNECT_ALERTS[result];
      if (alert) Alert.alert(...alert);
    });

  const handleDisconnect = () =>
    runExclusive(async () => {
      try {
        const todosWithEvent = todos
          .filter((t): t is Todo & { googleEventId: string } => !!t.googleEventId)
          .map((t) => ({ id: t.id, googleEventId: t.googleEventId }));
        // Todo는 지워졌는데 이벤트 삭제가 실패해 스냅샷에만 남은 고아 이벤트도 같이 보낸다 —
        // 해제 후 스냅샷이 비워지면 이 기록은 영영 사라진다.
        const uid = user?.uid;
        const orphanGoogleEventIds = uid
          ? findOrphanGoogleEventIds(await loadSnapshot(uid), todosWithEvent.map((t) => t.googleEventId))
          : [];
        const { allDeleted } = await disconnect(todosWithEvent, orphanGoogleEventIds);
        if (allDeleted) {
          Alert.alert("연동 해제 완료", "구글 캘린더 연동이 해제되었습니다");
        } else {
          Alert.alert(
            "일부 이벤트가 남아있습니다",
            "연동은 해제됐지만 일부 이벤트가 구글 캘린더에 그대로 남아있을 수 있습니다. 직접 삭제해주세요",
          );
        }
      } catch (error) {
        console.warn("[calendar] 연동 해제 실패", error);
        Alert.alert("연동 해제 실패", "잠시 후 다시 시도해주세요");
      }
    });

  // 엔타이틀먼트·연동 상태를 모르는 동안엔 버튼 높이만큼 빈 자리를 둬서 잠금↔버튼이
  // 깜빡이거나 달력이 위아래로 밀리지 않게 한다.
  if (isEntitlementLoading || (isPremium && isStatusLoading)) {
    return <View testID="calendar-connection-placeholder" style={styles.bar} />;
  }

  if (!isPremium) {
    return (
      <View style={styles.bar}>
        <View style={styles.lockedText}>
          <Text style={styles.lockedTitle}>구글 캘린더 연동 (프리미엄)</Text>
          <Text style={styles.lockedDescription}>할 일을 구글 캘린더에 동기화하려면 프리미엄 구독이 필요합니다</Text>
        </View>
        <Button title="구독 알아보기" variant="outline" onPress={() => navigation.navigate("Account")} />
      </View>
    );
  }

  if (!integration?.connected) {
    return (
      <View style={[styles.bar, styles.barEnd]}>
        <Button title="구글 캘린더 연동" variant="outline" onPress={() => void handleConnect()} disabled={isPending} />
      </View>
    );
  }

  return (
    <View style={[styles.bar, styles.barEnd]}>
      {integration.status === "revoked" && (
        <Text style={styles.revokedNotice}>연동이 끊겼습니다. 다시 연결해주세요</Text>
      )}
      <Button title="연동 해제" variant="outline" onPress={() => void handleDisconnect()} disabled={isPending} />
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    minHeight: MIN_TOUCH_TARGET + spacing.sm * 2,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  barEnd: {
    justifyContent: "flex-end",
  },
  lockedText: {
    flex: 1,
    gap: 2,
  },
  lockedTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  },
  lockedDescription: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  revokedNotice: {
    flex: 1,
    fontSize: 13,
    color: colors.danger.text,
  },
});
