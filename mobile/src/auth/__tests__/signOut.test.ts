import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { QueryClient } from "@tanstack/react-query";

const sentryMock = jest.requireMock("@sentry/react-native") as { captureException: jest.Mock };

const calls: string[] = [];

const mockAuth: { name: string; currentUser: { uid: string } | null } = { name: "auth", currentUser: { uid: "u1" } };
jest.mock("../../firebase", () => ({ auth: mockAuth }));

const mockDisablePush = jest.fn<(uid: string) => Promise<void>>();
jest.mock("../../reminders/push/pushClient", () => ({
  disablePushOnThisDevice: (uid: string) => mockDisablePush(uid),
}));

const mockFirebaseSignOut = jest.fn<(auth: unknown) => Promise<void>>();
jest.mock("firebase/auth", () => ({
  signOut: (auth: unknown) => mockFirebaseSignOut(auth),
}));

const mockGoogleSignOut = jest.fn<() => Promise<null>>();
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: { signOut: () => mockGoogleSignOut() },
}));

const mockCancelAll = jest.fn<() => Promise<void>>();
jest.mock("expo-notifications", () => ({
  cancelAllScheduledNotificationsAsync: () => mockCancelAll(),
}));

const makeQueryClient = () => {
  const clear = jest.fn(() => {
    calls.push("clear");
  });
  return { client: { clear } as unknown as QueryClient, clear };
};

describe("signOut", () => {
  beforeEach(() => {
    calls.length = 0;
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockCancelAll.mockReset().mockImplementation(async () => {
      calls.push("cancelNotifications");
    });
    mockGoogleSignOut.mockReset().mockImplementation(async () => {
      calls.push("googleSignOut");
      return null;
    });
    mockFirebaseSignOut.mockReset().mockImplementation(async () => {
      calls.push("firebaseSignOut");
    });
    mockDisablePush.mockReset().mockImplementation(async () => {
      calls.push("releasePush");
    });
    mockAuth.currentUser = { uid: "u1" };
  });

  it("signOut releases push token before firebase signOut", async () => {
    const { signOut } = await import("../signOut");
    const { client } = makeQueryClient();

    await signOut(client);

    expect(mockDisablePush).toHaveBeenCalledWith("u1");
    expect(calls.indexOf("releasePush")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("releasePush")).toBeLessThan(calls.indexOf("firebaseSignOut"));
  });

  it("signOut proceeds when release fails", async () => {
    sentryMock.captureException.mockClear();
    mockDisablePush.mockRejectedValueOnce(new Error("offline"));
    const { signOut } = await import("../signOut");
    const { client, clear } = makeQueryClient();

    await signOut(client);

    expect(mockFirebaseSignOut).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    expect(sentryMock.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { feature: "reminder" } });
  });

  it("로그인 사용자가 없으면 푸시 해제를 건너뛴다", async () => {
    mockAuth.currentUser = null;
    const { signOut } = await import("../signOut");
    const { client } = makeQueryClient();

    await signOut(client);

    expect(mockDisablePush).not.toHaveBeenCalled();
    expect(mockFirebaseSignOut).toHaveBeenCalled();
  });

  it("예약 알림 취소 → 푸시 해제 → 구글 로그아웃 → firebase 로그아웃 → 캐시 비우기 순서로 실행한다", async () => {
    const { signOut } = await import("../signOut");
    const { client } = makeQueryClient();

    await signOut(client);

    expect(calls).toEqual(["cancelNotifications", "releasePush", "googleSignOut", "firebaseSignOut", "clear"]);
    expect(mockFirebaseSignOut).toHaveBeenCalledWith(mockAuth);
  });

  it("구글 로그아웃이 실패해도 firebase 로그아웃과 캐시 비우기는 진행한다", async () => {
    sentryMock.captureException.mockClear();
    mockGoogleSignOut.mockRejectedValueOnce(new Error("google down"));
    const { signOut } = await import("../signOut");
    const { client, clear } = makeQueryClient();

    await signOut(client);

    expect(mockFirebaseSignOut).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    // 구글 세션이 이미 없을 때도 나는 무해한 실패라 Sentry로 보내지 않는다.
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("예약 알림 취소가 실패해도 로그아웃은 진행한다", async () => {
    sentryMock.captureException.mockClear();
    mockCancelAll.mockRejectedValueOnce(new Error("notifications unavailable"));
    const { signOut } = await import("../signOut");
    const { client, clear } = makeQueryClient();

    await signOut(client);

    expect(mockFirebaseSignOut).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    expect(sentryMock.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { feature: "auth" } });
  });

  it("firebase 로그아웃이 실패하면 오류를 던지고 캐시는 비우지 않는다", async () => {
    mockFirebaseSignOut.mockRejectedValueOnce(new Error("network"));
    const { signOut } = await import("../signOut");
    const { client, clear } = makeQueryClient();

    await expect(signOut(client)).rejects.toThrow("network");
    expect(clear).not.toHaveBeenCalled();
  });
});
