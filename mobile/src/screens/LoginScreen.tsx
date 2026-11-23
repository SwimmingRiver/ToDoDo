import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import * as AppleAuthentication from "expo-apple-authentication";
import type { UserCredential } from "firebase/auth";
import { isAccountExistsError, isUserCancelledSignIn } from "@tododo/core/dist/auth/index.js";
import { signInWithGoogle } from "../auth/googleSignIn";
import { isAppleSignInAvailable, signInWithApple } from "../auth/appleSignIn";
import { consumeLinkedNotice } from "../auth/linkedNotice";
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

const LINKED_NOTICE = "이제 Google·Apple 둘 다로 로그인할 수 있어요";
const ACCOUNT_EXISTS_MESSAGE = "이미 다른 방법으로 가입된 이메일이에요. 그 방법으로 로그인해 주세요.";
const GENERIC_ERROR_MESSAGE = "로그인 중 오류가 발생했습니다. 다시 시도해주세요.";
const APPLE_HINT = "전에 Google로 가입했다면 Google로 로그인해 주세요.";

export const LoginScreen = () => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    isAppleSignInAvailable()
      .then((available) => {
        if (active) setAppleAvailable(available);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // 오류 처리 규칙은 웹 로그인 화면과 같다.
  const login = async (signIn: () => Promise<UserCredential>) => {
    // 네이티브 Apple 버튼엔 disabled가 없어 여기서 중복 실행을 막는다.
    if (isLoading) return;
    setError(null);
    setIsLoading(true);
    try {
      const result = await signIn();
      if (await consumeLinkedNotice(result.user)) Alert.alert("로그인 방법 연결", LINKED_NOTICE);
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      if (isUserCancelledSignIn(code)) {
        // 사용자가 창을 닫음 — 안내 불필요
      } else if (isAccountExistsError(code)) {
        setError(ACCOUNT_EXISTS_MESSAGE);
      } else {
        setError(GENERIC_ERROR_MESSAGE);
      }
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
        <View style={styles.buttons}>
          <Pressable
            onPress={() => login(signInWithGoogle)}
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
          {appleAvailable && (
            // 문구·로고·색은 iOS가 그린다(검정 바탕, 기기 언어로 "Apple로 로그인")
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={8}
              onPress={() => login(signInWithApple)}
              style={[styles.appleButton, isLoading && styles.googleButtonDisabled]}
            />
          )}
        </View>
        {appleAvailable && <Text style={styles.hint}>{APPLE_HINT}</Text>}
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
  buttons: {
    width: "100%",
    gap: spacing.md,
  },
  appleButton: {
    width: "100%",
    height: MIN_TOUCH_TARGET,
  },
  hint: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: "center",
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.text.secondary,
  },
});
