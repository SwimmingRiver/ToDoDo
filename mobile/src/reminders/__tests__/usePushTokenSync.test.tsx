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
    cancelQueuedPushSync: jest.fn(),
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

  it("no rerun after unmount", async () => {
    const mod = jest.requireMock("../push/pushClient") as {
      syncPushToken: AnyMock;
      cancelQueuedPushSync: AnyMock;
      __emit: () => void;
    };
    const { onTokenRefresh } = jest.requireMock("@react-native-firebase/messaging") as { onTokenRefresh: AnyMock };
    const { usePushTokenSync } = await import("../hooks/usePushTokenSync");
    const { unmount } = await renderHook(() => usePushTokenSync());
    await flush();
    const tokenCb = onTokenRefresh.mock.calls[0][1] as () => void;
    await unmount();
    expect(mod.cancelQueuedPushSync).toHaveBeenCalledWith("u1");
    tokenCb();
    mod.__emit();
    await flush();
    expect(mod.syncPushToken).toHaveBeenCalledTimes(1);
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
