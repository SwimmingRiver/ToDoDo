import { renderHook, act } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));
jest.mock("../../shared/lib/sentry", () => ({ reportError: jest.fn() }));
jest.mock("../push/pushClient", () => {
  const listeners = new Set<() => void>();
  return {
    syncPushToken: jest.fn(() => Promise.resolve()),
    subscribePushPermissionChanged: jest.fn((l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    }),
    __emit: () => listeners.forEach((l) => l()),
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.Mock<(...args: any[]) => any>;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("usePushTokenSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("syncs on mount and on token refresh", async () => {
    const { syncPushToken } = jest.requireMock("../push/pushClient") as { syncPushToken: AnyMock };
    const { onTokenRefresh } = jest.requireMock("@react-native-firebase/messaging") as { onTokenRefresh: AnyMock };
    const { usePushTokenSync } = await import("../hooks/usePushTokenSync");
    await renderHook(() => usePushTokenSync());
    await flush();
    expect(syncPushToken).toHaveBeenCalledTimes(1);
    expect(syncPushToken).toHaveBeenCalledWith("u1");
    const cb = onTokenRefresh.mock.calls[0][1] as () => void;
    cb();
    await flush();
    expect(syncPushToken).toHaveBeenCalledTimes(2);
  });

  it("resyncs when permission changes to granted", async () => {
    const mod = jest.requireMock("../push/pushClient") as { syncPushToken: AnyMock; __emit: () => void };
    const { usePushTokenSync } = await import("../hooks/usePushTokenSync");
    await renderHook(() => usePushTokenSync());
    await flush();
    mod.__emit();
    await flush();
    expect(mod.syncPushToken).toHaveBeenCalledTimes(2);
  });

  it("does not overlap concurrent syncs and runs one trailing sync", async () => {
    const mod = jest.requireMock("../push/pushClient") as { syncPushToken: AnyMock; __emit: () => void };
    let release: () => void = () => {};
    mod.syncPushToken.mockImplementationOnce(() => new Promise<void>((r) => { release = r; }));
    const { usePushTokenSync } = await import("../hooks/usePushTokenSync");
    await renderHook(() => usePushTokenSync());
    mod.__emit();
    mod.__emit();
    expect(mod.syncPushToken).toHaveBeenCalledTimes(1);
    release();
    await flush();
    await flush();
    expect(mod.syncPushToken).toHaveBeenCalledTimes(2);
  });

  it("reports errors via reportError without throwing", async () => {
    const mod = jest.requireMock("../push/pushClient") as { syncPushToken: AnyMock };
    const { reportError } = jest.requireMock("../../shared/lib/sentry") as { reportError: AnyMock };
    const err = new Error("boom");
    mod.syncPushToken.mockImplementationOnce(() => Promise.reject(err));
    const { usePushTokenSync } = await import("../hooks/usePushTokenSync");
    await renderHook(() => usePushTokenSync());
    await flush();
    await flush();
    expect(reportError).toHaveBeenCalledWith(err, "reminder");
  });
});
