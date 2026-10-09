import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthState } from "../auth/useAuthState";
import { signOut } from "../auth/signOut";
import { Button } from "../shared/ui/button/Button";
import { colors } from "../theme/colors";
import { radius, spacing } from "../theme/spacing";

export const AccountScreen = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);

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
        disabled={isSigningOut}
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
