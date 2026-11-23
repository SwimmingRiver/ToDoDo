import { describe, it, expect, jest, beforeEach } from "@jest/globals";
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
const mockRevokeAccessToken = jest.fn<(auth: unknown, token: string) => Promise<void>>();
jest.mock("firebase/auth", () => ({
  OAuthProvider: function (providerId: string) {
    return { credential: (options: object) => mockCredential({ providerId, ...options }) };
  },
  signInWithCredential: (auth: unknown, credential: unknown) => mockSignInWithCredential(auth, credential),
  updateProfile: (user: unknown, profile: unknown) => mockUpdateProfile(user, profile),
  revokeAccessToken: (auth: unknown, token: string) => mockRevokeAccessToken(auth, token),
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
  beforeEach(() => {
    mockRevokeAccessToken.mockReset().mockResolvedValue(undefined);
  });

  it("다시 받은 인증 코드로 토큰을 해지한다", async () => {
    mockSignInAsync.mockReset().mockResolvedValue({ authorizationCode: "auth-code" });
    await revokeAppleSignIn();
    expect(mockSignInAsync).toHaveBeenCalledWith({ requestedScopes: [] });
    expect(mockRevokeAccessToken).toHaveBeenCalledWith(mockAuth, "auth-code");
  });

  it("인증 코드가 없으면 실패한다", async () => {
    mockSignInAsync.mockReset().mockResolvedValue({ authorizationCode: null });
    await expect(revokeAppleSignIn()).rejects.toThrow();
    expect(mockRevokeAccessToken).not.toHaveBeenCalled();
  });
});
