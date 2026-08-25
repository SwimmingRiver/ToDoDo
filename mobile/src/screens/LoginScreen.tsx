import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { signInWithGoogle } from "../auth/googleSignIn";
import { colors } from "../theme/colors";
import { MIN_TOUCH_TARGET, spacing } from "../theme/spacing";

const GoogleIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 48 48">
    <Path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <Path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <Path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <Path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </Svg>
);

export const LoginScreen = () => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인에 실패했습니다");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.card}>
        <Text style={styles.title}>ToDoDo</Text>
        {error && (
          <View style={styles.errorPill}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <Pressable
          onPress={handleLogin}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel={isLoading ? "로그인 중..." : "Google로 로그인"}
          accessibilityState={{ disabled: isLoading }}
          style={({ pressed }) => [
            styles.googleButton,
            pressed && !isLoading && styles.googleButtonPressed,
            isLoading && styles.googleButtonDisabled,
          ]}
        >
          <GoogleIcon />
          <Text style={styles.googleButtonText}>
            {isLoading ? "로그인 중..." : "Google로 로그인"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.secondary,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: spacing.xxl,
    paddingVertical: 48,
    paddingHorizontal: 40,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.background.primary,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text.primary,
  },
  errorPill: {
    width: "100%",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.danger.background,
    borderRadius: 6,
  },
  errorText: {
    fontSize: 14,
    color: colors.danger.text,
    textAlign: "center",
  },
  googleButton: {
    width: "100%",
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.border.secondary,
    borderRadius: 8,
  },
  googleButtonPressed: {
    backgroundColor: colors.background.secondary,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.text.secondary,
  },
});
