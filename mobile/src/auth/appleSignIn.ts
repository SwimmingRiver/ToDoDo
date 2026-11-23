import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { OAuthProvider, signInWithCredential, updateProfile } from "firebase/auth";
import type { User, UserCredential } from "firebase/auth";
import { Platform } from "react-native";
import { formatAppleDisplayName } from "@tododo/core/dist/auth/index.js";
import { auth } from "../firebase";

const isAppleUser = (user: Pick<User, "providerData">): boolean =>
  user.providerData.some((p) => p.providerId === "apple.com");

// 탈퇴 때 Apple 토큰 해지(확인 창)가 필요한지. 탈퇴 로직과 확인 창 안내가 같은 조건을 쓴다.
// Android는 Apple 창을 띄울 수 없어 해지를 건너뛴다 — Apple ID의 'Apple로 로그인' 목록에는 남을 수 있음
// (웹에서 탈퇴하면 해지됨), 스펙상 Android Apple 로그인은 범위 밖.
export const needsAppleRevoke = (user: Pick<User, "providerData">): boolean =>
  Platform.OS === "ios" && isAppleUser(user);

// Apple 로그인은 iOS에서만 제공한다.
export const isAppleSignInAvailable = async (): Promise<boolean> =>
  Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync());

export const signInWithApple = async (): Promise<UserCredential> => {
  // Apple엔 해시를, Firebase엔 원본을 넘겨 토큰 재사용을 막는다.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const { identityToken, fullName } = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });
  if (!identityToken) throw new Error("Apple 로그인 토큰을 받지 못했습니다");
  const credential = new OAuthProvider("apple.com").credential({ idToken: identityToken, rawNonce });
  const result = await signInWithCredential(auth, credential);

  // 이름은 첫 로그인 때만 온다. 한국어 순서로 보정하되 실패해도 로그인은 막지 않는다.
  const name = formatAppleDisplayName(fullName?.givenName, fullName?.familyName);
  if (name && name !== result.user.displayName) {
    try {
      await updateProfile(result.user, { displayName: name });
    } catch (error) {
      console.error("Apple 이름 보정 실패:", error);
    }
  }
  return result;
};

// app.json의 ios.bundleIdentifier와 같아야 한다(테스트가 확인).
const IOS_BUNDLE_ID = "com.swimmingriver.tododo";

// 탈퇴 전 Apple 토큰 해지. 새 인증 코드가 필요해 확인 창이 한 번 더 열린다(취소하면 그 오류가 그대로 던져진다).
// Firebase JS의 revokeAccessToken은 tokenType을 ACCESS_TOKEN으로 고정해 보낸다. iOS가 주는 건 인증 코드라
// 네이티브 SDK처럼 tokenType CODE로 Identity Toolkit을 직접 부른다. 번들 ID 헤더도 네이티브 SDK처럼 보낸다 —
// 없으면 Firebase가 웹 Services ID로 코드를 교환해 Apple이 "client_id mismatch"로 거절한다(11-23 실기 확인).
export const revokeAppleSignIn = async (user: Pick<User, "getIdToken">): Promise<void> => {
  const { authorizationCode } = await AppleAuthentication.signInAsync({ requestedScopes: [] });
  if (!authorizationCode) throw new Error("Apple 인증 코드를 받지 못했습니다");
  // Expo가 빌드 시 인라인한다. 함수 안에서 읽어 테스트가 값을 바꿀 수 있게 한다.
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "";
  const res = await fetch(`https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ios-Bundle-Identifier": IOS_BUNDLE_ID },
    body: JSON.stringify({
      providerId: "apple.com",
      tokenType: "CODE",
      token: authorizationCode,
      idToken: await user.getIdToken(),
    }),
  });
  if (!res.ok) throw new Error(`Apple 토큰 해지 실패 (${res.status}${await readErrorMessage(res)})`);
};

// Identity Toolkit 오류 본문의 error.message를 붙인다 — 상태 코드만으론 원인(예: client_id mismatch)을 알 수 없다.
const readErrorMessage = async (res: Response): Promise<string> => {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    return typeof body.error?.message === "string" ? `: ${body.error.message}` : "";
  } catch {
    return "";
  }
};
