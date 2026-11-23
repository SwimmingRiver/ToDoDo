import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Platform } from "react-native";

const mockSignInAsync = jest.fn<(options: unknown) => Promise<unknown>>();
const mockIsAvailableAsync = jest.fn<() => Promise<boolean>>();
jest.mock("expo-apple-authentication", () => ({
  signInAsync: (options: unknown) => mockSignInAsync(options),
  isAvailableAsync: () => mockIsAvailableAsync(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock("expo-crypto", () => ({
  randomUUID: () => "raw-nonce",
  digestStringAsync: async (algorithm: string, data: string) => `hash(${algorithm}:${data})`,
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));

const mockAuth = { currentUser: null };
// import가 위로 끌어올려져 팩토리가 먼저 실행되므로 getter로 늦게 읽는다.
jest.mock("../../firebase", () => ({
  get auth() {
    return mockAuth;
  },
}));

const mockCredential = jest.fn((options: unknown) => ({ credential: options }));
const mockSignInWithCredential = jest.fn<(auth: unknown, credential: unknown) => Promise<unknown>>();
const mockUpdateProfile = jest.fn<(user: unknown, profile: unknown) => Promise<void>>();
jest.mock("firebase/auth", () => ({
  OAuthProvider: function (providerId: string) {
    return { credential: (options: object) => mockCredential({ providerId, ...options }) };
  },
  signInWithCredential: (auth: unknown, credential: unknown) => mockSignInWithCredential(auth, credential),
  updateProfile: (user: unknown, profile: unknown) => mockUpdateProfile(user, profile),
}));

import { isAppleSignInAvailable, revokeAppleSignIn, signInWithApple } from "../appleSignIn";

const user = { uid: "u1", displayName: null };

describe("signInWithApple", () => {
  beforeEach(() => {
    mockSignInAsync.mockReset().mockResolvedValue({
      identityToken: "id-token",
      fullName: { givenName: "수영", familyName: "강" },
    });
    mockCredential.mockClear();
    mockSignInWithCredential.mockReset().mockResolvedValue({ user });
    mockUpdateProfile.mockReset().mockResolvedValue(undefined);
  });

  it("Apple에는 SHA-256 해시 nonce를, Firebase에는 원본 nonce를 넘긴다", async () => {
    await signInWithApple();

    expect(mockSignInAsync).toHaveBeenCalledWith({ requestedScopes: [0, 1], nonce: "hash(SHA-256:raw-nonce)" });
    expect(mockCredential).toHaveBeenCalledWith({ providerId: "apple.com", idToken: "id-token", rawNonce: "raw-nonce" });
    expect(mockSignInWithCredential).toHaveBeenCalledWith(mockAuth, expect.anything());
  });

  it("한국어 이름은 성+이름 순서로 저장한다", async () => {
    await signInWithApple();
    expect(mockUpdateProfile).toHaveBeenCalledWith(user, { displayName: "강수영" });
  });

  it("이름이 없으면(두 번째 로그인부터) updateProfile을 부르지 않는다", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: "id-token", fullName: null });
    await signInWithApple();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("updateProfile이 실패해도 로그인은 성공한다", async () => {
    mockUpdateProfile.mockRejectedValue(new Error("network"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(signInWithApple()).resolves.toEqual({ user });
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("identityToken이 없으면 실패하고 Firebase에 로그인하지 않는다", async () => {
    mockSignInAsync.mockResolvedValue({ identityToken: null, fullName: null });
    await expect(signInWithApple()).rejects.toThrow();
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });
});

describe("isAppleSignInAvailable", () => {
  it("iOS에서 기기가 지원하면 true", async () => {
    const restore = jest.replaceProperty(Platform, "OS", "ios");
    mockIsAvailableAsync.mockResolvedValue(true);
    try {
      await expect(isAppleSignInAvailable()).resolves.toBe(true);
    } finally {
      restore.restore();
    }
  });

  it("Android면 묻지 않고 false", async () => {
    const restore = jest.replaceProperty(Platform, "OS", "android");
    mockIsAvailableAsync.mockReset().mockResolvedValue(true);
    try {
      await expect(isAppleSignInAvailable()).resolves.toBe(false);
      expect(mockIsAvailableAsync).not.toHaveBeenCalled();
    } finally {
      restore.restore();
    }
  });
});

describe("revokeAppleSignIn", () => {
  const fetchMock = jest.fn<typeof fetch>();
  const revokeUser = { getIdToken: async () => "firebase-id-token" };

  beforeEach(() => {
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY = "api-key";
    fetchMock.mockReset().mockImplementation(async () => new Response("{}", { status: 200 }));
    global.fetch = fetchMock;
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  });

  it("다시 받은 인증 코드를 tokenType CODE로 Identity Toolkit에 보내 해지한다", async () => {
    mockSignInAsync.mockReset().mockResolvedValue({ authorizationCode: "auth-code" });
    await revokeAppleSignIn(revokeUser);

    expect(mockSignInAsync).toHaveBeenCalledWith({ requestedScopes: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=api-key");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      providerId: "apple.com",
      tokenType: "CODE",
      token: "auth-code",
      idToken: "firebase-id-token",
    });
  });

  // 실기 확인(11-23): 헤더가 없으면 Firebase가 웹 Services ID로 코드를 교환해 Apple이
  // "client_id mismatch"로 거절한다. 앱 코드는 번들 ID로 발급되므로 번들 ID를 알려야 한다.
  it("Firebase가 앱 번들 ID로 코드를 교환하도록 X-Ios-Bundle-Identifier를 app.json 값으로 보낸다", async () => {
    mockSignInAsync.mockReset().mockResolvedValue({ authorizationCode: "auth-code" });
    await revokeAppleSignIn(revokeUser);

    const appJson = jest.requireActual<{ expo: { ios: { bundleIdentifier: string } } }>("../../../app.json");
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>)["X-Ios-Bundle-Identifier"]).toBe(appJson.expo.ios.bundleIdentifier);
  });

  it("해지 응답이 실패면 던진다", async () => {
    mockSignInAsync.mockReset().mockResolvedValue({ authorizationCode: "auth-code" });
    fetchMock.mockImplementation(async () => new Response("{}", { status: 400 }));
    await expect(revokeAppleSignIn(revokeUser)).rejects.toThrow("400");
  });

  it("인증 코드가 없으면 실패한다", async () => {
    mockSignInAsync.mockReset().mockResolvedValue({ authorizationCode: null });
    await expect(revokeAppleSignIn(revokeUser)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
