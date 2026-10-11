import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthState } from "../auth/useAuthState";
import { signOut } from "../auth/signOut";
import { deleteAccount } from "../account/deleteAccount";
import { Button } from "../shared/ui/button/Button";
import { colors } from "../theme/colors";
import { radius, spacing } from "../theme/spacing";

// 앱은 아직 구독 상태를 표시하지 않으므로 구독 해지 안내를 항상 함께 보여준다.
const DELETE_MESSAGE =
  "할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다.\n\n구독이 즉시 해지되고 남은 기간은 사라집니다. 결제 14일 이내라면 환불을 요청할 수 있습니다.";

export const AccountScreen = () => {
  const { user } = useAuthState();
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
    } catch {
      setIsDeleting(false);
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
    Alert.alert("회원 탈퇴", DELETE_MESSAGE, [
      { text: "취소", style: "cancel" },
      { text: "탈퇴하기", style: "destructive", onPress: runDeleteAccount },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.section}>
        <Text style={styles.label}>로그인 계정</Text>
        <Text style={styles.email}>{user?.email ?? ""}</Text>
      </View>
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
