import { useState } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthState } from "../auth/useAuthState";
import { signOut } from "../auth/signOut";
import { deleteAccount } from "../account/deleteAccount";
import { needsAppleRevoke } from "../auth/appleSignIn";
import { isUserCancelledSignIn } from "@tododo/core/dist/auth/index.js";
import { isAutoRenewingStore } from "@tododo/core/dist/entitlement/index.js";
import { PremiumSection } from "../premium/PremiumSection";
import { useEntitlement } from "../premium/useEntitlement";
import { purchaseClient } from "../premium/iap/purchaseClient";
import { Button } from "../shared/ui/button/Button";
import { colors } from "../theme/colors";
import { radius, spacing } from "../theme/spacing";

// 기본 문구는 항상 보인다. 아래 안내들은 해당 구독이 있을 때만 덧붙인다.
const DELETE_MESSAGE = "할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다.";
// Paddle 구독은 서버가 탈퇴 때 즉시 해지한다. 살아 있는 Paddle 기록이 있을 때만 보인다(웹 accountDeletionDialog와 같은 기준).
// Apple 구독자에게 보이면 "즉시 해지"와 "해지되지 않아요" 경고가 서로 모순된다.
const PADDLE_NOTICE = "구독이 즉시 해지되고 남은 기간은 사라집니다. 결제 14일 이내라면 환불을 요청할 수 있습니다.";

// Apple은 서버가 해지할 수 없어 경고하고 구독 관리로 보낸다. Google은 서버가 탈퇴 때 함께 해지하므로 안내만 한다(스펙 7절).
const APPLE_WARNING = "App Store 구독은 탈퇴해도 해지되지 않고 Apple을 통해 계속 결제돼요. 먼저 구독을 해지해 주세요.";
const GOOGLE_NOTICE = "Google Play 구독은 탈퇴하면 함께 해지돼요.";
// 구독과 무관하게 Apple로 로그인한 사용자는 토큰 해지를 위해 Apple 확인 창을 한 번 더 거친다.
const APPLE_SIGN_IN_NOTICE = "Apple 계정 확인 창이 한 번 더 열려요.";

export const AccountScreen = () => {
  const { user } = useAuthState();
  const { data: entitlement } = useEntitlement();
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 성공하면 RootNavigator가 user=null을 받아 로그인 화면으로 바꾸므로 여기서 이동하지 않는다.
  const runSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut(queryClient);
    } catch {
      setIsSigningOut(false);
      Alert.alert("로그아웃 실패", "잠시 후 다시 시도해주세요.");
    }
  };

  const handleSignOutPress = () => {
    Alert.alert("로그아웃", "로그아웃할까요?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", style: "destructive", onPress: runSignOut },
    ]);
  };

  // 성공하면 signOut이 user=null을 만들어 RootNavigator가 로그인 화면으로 바꾼다.
  const runDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await deleteAccount();
    } catch (error) {
      setIsDeleting(false);
      // Apple 확인 창을 닫았으면 아무것도 지워지지 않았다 — 실패 안내 없이 원래 상태로.
      if (isUserCancelledSignIn((error as { code?: unknown } | null)?.code)) return;
      Alert.alert("탈퇴 실패", "일부만 처리되었습니다. 다시 시도해 주세요.");
      return;
    }
    try {
      await signOut(queryClient);
    } catch {
      // 계정은 이미 삭제됐다. 세션만 남은 상태라 재실행하면 토큰 갱신에서 끊긴다.
      Alert.alert("탈퇴 완료", "앱을 다시 실행해 주세요.");
    }
  };

  const handleDeletePress = () => {
    // 스토어별로 따로 본다 — 둘 다 자동 갱신 중이면 경고와 안내가 함께 나온다.
    const appleRenewing = !!entitlement && isAutoRenewingStore(entitlement, "apple");
    const googleRenewing = !!entitlement && isAutoRenewingStore(entitlement, "google");
    const paddleRecord = entitlement?.sources.paddle;
    const hasPaddleSubscription = !!paddleRecord && paddleRecord.status !== "canceled";
    // 구독 관리 화면은 플랫폼 스토어로 열린다 — Android에서 누르면 Play가 열려 Apple 구독을 해지할 수 없다.
    const showManageButton = appleRenewing && Platform.OS === "ios";
    const message = [
      DELETE_MESSAGE,
      hasPaddleSubscription && PADDLE_NOTICE,
      appleRenewing && APPLE_WARNING,
      googleRenewing && GOOGLE_NOTICE,
      !!user && needsAppleRevoke(user) && APPLE_SIGN_IN_NOTICE,
    ]
      .filter(Boolean)
      .join("\n\n");
    Alert.alert("회원 탈퇴", message, [
      { text: "취소", style: "cancel" },
      ...(showManageButton ? [{ text: "구독 관리", onPress: () => void purchaseClient.openManageSubscriptions() }] : []),
      { text: "탈퇴하기", style: "destructive", onPress: runDeleteAccount },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.section}>
        <Text style={styles.label}>로그인 계정</Text>
        <Text style={styles.email}>{user?.email ?? ""}</Text>
      </View>
      <PremiumSection />
      <Button
        title="로그아웃"
        variant="outline"
        onPress={handleSignOutPress}
        disabled={isSigningOut || isDeleting}
      />
      <Button
        title="회원 탈퇴"
        variant="dangerText"
        onPress={handleDeletePress}
        disabled={isSigningOut || isDeleting}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  section: {
    backgroundColor: colors.background.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  label: {
    fontSize: 13,
    color: colors.text.tertiary,
  },
  email: {
    fontSize: 16,
    color: colors.text.primary,
  },
});
