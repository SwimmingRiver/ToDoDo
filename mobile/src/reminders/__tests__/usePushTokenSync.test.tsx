import { renderHook, act } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { AppState } from "react-native";

jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));
jest.mock("../../shared/lib/sentry", () => ({ reportError: jest.fn() }));
jest.mock("../push/pushClient", () => {
  const listeners = new Set<() => void>();
  return {
    syncPushToken: jest.fn(() => Promise.resolve()),
    cancelQueuedPushSync: jest.fn(),
    resetPushReleaseLatch: jest.fn(),
    getPushPermission: jest.fn(() => Promise.resolve("undetermined")),
    notifyPushPermissionChanged: jest.fn(() => listeners.forEach((l) => l())),
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

  it("releases the logout latch on sign-in before the first sync", async () => {
    const mod = jest.requireMock("../push/pushClient") as { syncPushToken: AnyMock; resetPushReleaseLatch: AnyMock };
    const { usePushTokenSync } = await import("../hooks/usePushTokenSync");
    await renderHook(() => usePushTokenSync());
    await flush();
    expect(mod.resetPushReleaseLatch).toHaveBeenCalledTimes(1);
    expect(mod.resetPushReleaseLatch.mock.invocationCallOrder[0]).toBeLessThan(
      mod.syncPushToken.mock.invocationCallOrder[0],
    );
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

  describe("permission changed outside the app (iOS Settings)", () => {
    type Listener = (state: string) => void;
    const setup = async () => {
      const appStateListeners: Listener[] = [];
      jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, l: Listener) => {
        appStateListeners.push(l);
        return { remove: jest.fn() };
      }) as never);
      const mod = jest.requireMock("../push/pushClient") as {
        syncPushToken: AnyMock;
        getPushPermission: AnyMock;
        notifyPushPermissionChanged: AnyMock;
      };
      const { usePushTokenSync } = await import("../hooks/usePushTokenSync");
      const view = await renderHook(() => usePushTokenSync());
      await flush();
      const goActive = async () => {
        await act(async () => {
          appStateListeners.forEach((l) => l("active"));
        });
        await flush();
      };
      return { mod, goActive, view };
    };

    it("notifies and resyncs when permission became granted while in background", async () => {
      const { mod, goActive } = await setup();
      expect(mod.syncPushToken).toHaveBeenCalledTimes(1);
      mod.getPushPermission.mockResolvedValue("granted");
      await goActive();

      expect(mod.notifyPushPermissionChanged).toHaveBeenCalledTimes(1);
      expect(mod.syncPushToken).toHaveBeenCalledTimes(2);
    });

    it("does nothing when permission is unchanged on return", async () => {
      const { mod, goActive } = await setup();
      await goActive();

      expect(mod.notifyPushPermissionChanged).not.toHaveBeenCalled();
      expect(mod.syncPushToken).toHaveBeenCalledTimes(1);
    });

    it("does not notify again for a change the app itself already announced", async () => {
      const { mod, goActive } = await setup();
      mod.getPushPermission.mockResolvedValue("granted");
      // 앱 안에서 켜기(enablePushOnThisDevice)가 알린 변경
      await act(async () => {
        (jest.requireMock("../push/pushClient") as { __emit: () => void }).__emit();
      });
      await flush();
      mod.notifyPushPermissionChanged.mockClear();
      await goActive();

      expect(mod.notifyPushPermissionChanged).not.toHaveBeenCalled();
    });
  });
});
