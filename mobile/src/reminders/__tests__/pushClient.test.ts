import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getPushPermission,
  notifyPushPermissionChanged,
  subscribePushPermissionChanged,
  syncPushToken,
  cancelQueuedPushSync,
} from "../push/pushClient";
import type { ReleasePending } from "../push/releasePending";

const PENDING_KEY = "tododo:pushReleasePending";

// 메모리 저장소처럼 동작하는 목
const store = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));
const getItem = jest.mocked(AsyncStorage.getItem);
const setItem = jest.mocked(AsyncStorage.setItem);
const removeItem = jest.mocked(AsyncStorage.removeItem);

const mockRegister = jest.fn<(token: string, platform: string) => Promise<void>>();
const mockUnregister = jest.fn<(token: string) => Promise<void>>();
jest.mock("../api/reminderProxyApi", () => ({
  registerPushToken: (token: string, platform: string) => mockRegister(token, platform),
  unregisterPushToken: (token: string) => mockUnregister(token),
}));

type MessagingMock = {
  AuthorizationStatus: Record<string, number>;
  getToken: jest.Mock<() => Promise<string>>;
  deleteToken: jest.Mock<() => Promise<void>>;
  requestPermission: jest.Mock<() => Promise<number>>;
  hasPermission: jest.Mock<() => Promise<number>>;
};
const messaging = jest.requireMock("@react-native-firebase/messaging") as MessagingMock;
const { AuthorizationStatus } = messaging;

const readPending = (): ReleasePending | null => {
  const raw = store.get(PENDING_KEY);
  return raw ? (JSON.parse(raw) as ReleasePending) : null;
};
const seedPending = (p: ReleasePending) => store.set(PENDING_KEY, JSON.stringify(p));

describe("pushClient", () => {
  beforeEach(() => {
    store.clear();
    getItem.mockReset().mockImplementation(async (key: string) => store.get(key) ?? null);
    setItem.mockReset().mockImplementation(async (key: string, value: string) => {
      store.set(key, value);
    });
    removeItem.mockReset().mockImplementation(async (key: string) => {
      store.delete(key);
    });
    mockRegister.mockReset().mockResolvedValue(undefined);
    mockUnregister.mockReset().mockResolvedValue(undefined);
    messaging.getToken.mockReset().mockResolvedValue("new-token");
    messaging.deleteToken.mockReset().mockResolvedValue(undefined);
    messaging.requestPermission.mockReset().mockResolvedValue(AuthorizationStatus.AUTHORIZED);
    messaging.hasPermission.mockReset().mockResolvedValue(AuthorizationStatus.AUTHORIZED);
  });

  describe("getPushPermission", () => {
    it.each([
      [AuthorizationStatus.AUTHORIZED, "granted"],
      [AuthorizationStatus.PROVISIONAL, "granted"],
      [AuthorizationStatus.EPHEMERAL, "granted"],
      [AuthorizationStatus.DENIED, "denied"],
      [AuthorizationStatus.NOT_DETERMINED, "undetermined"],
    ])("status %p → %p", async (status, expected) => {
      messaging.hasPermission.mockResolvedValue(status);
      await expect(getPushPermission()).resolves.toBe(expected);
    });
  });

  describe("syncPushToken serialization", () => {
    const gate = () => {
      let open!: () => void;
      const promise = new Promise<void>((r) => {
        open = r;
      });
      return { promise, open };
    };

    it("concurrent sync calls for same uid do not overlap", async () => {
      const events: string[] = [];
      const g = gate();
      seedPending({ token: "old", uid: "u1", serverDeleted: true, deviceDeleted: false });
      messaging.deleteToken.mockImplementation(async () => {
        events.push("delete:start");
        await g.promise;
        events.push("delete:end");
      });
      messaging.getToken.mockImplementation(async () => {
        events.push("getToken");
        return "new-token";
      });
      const a = syncPushToken("u1");
      const b = syncPushToken("u1");
      const c = syncPushToken("u1");
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));
      expect(events).toEqual(["delete:start"]);
      g.open();
      await Promise.all([a, b, c]);
      // 두 번째 실행은 첫 실행이 끝난 뒤에만 시작하고, 세 호출은 후행 하나로 합쳐진다.
      expect(events).toEqual(["delete:start", "delete:end", "getToken", "getToken"]);
      expect(mockRegister).toHaveBeenCalledTimes(2);
    });

    it("enable + permission listener produce a single overlapping-free sequence", async () => {
      const events: string[] = [];
      const g = gate();
      seedPending({ token: "old", uid: "u1", serverDeleted: true, deviceDeleted: false });
      messaging.deleteToken.mockImplementation(async () => {
        events.push("delete:start");
        await g.promise;
        events.push("delete:end");
      });
      messaging.getToken.mockImplementation(async () => {
        events.push("getToken");
        return "new-token";
      });
      // 훅의 리스너가 권한 변경 알림에 반응해 sync를 시작하는 것을 흉내 낸다.
      const off = subscribePushPermissionChanged(() => void syncPushToken("u1"));
      const enabling = enablePushOnThisDevice("u1");
      await new Promise((r) => setImmediate(r));
      expect(events).toEqual(["delete:start"]);
      g.open();
      await enabling;
      off();
      expect(events.indexOf("getToken")).toBeGreaterThan(events.indexOf("delete:end"));
      expect(events.filter((e) => e === "delete:start")).toHaveLength(1);
    });

    it("drops a queued sync for a cancelled uid", async () => {
      const g = gate();
      messaging.getToken.mockImplementationOnce(async () => {
        await g.promise;
        return "t";
      });
      const a = syncPushToken("u1");
      const b = syncPushToken("u1");
      cancelQueuedPushSync("u1");
      g.open();
      await Promise.all([a, b]);
      expect(mockRegister).toHaveBeenCalledTimes(1);
    });
  });

  describe("disable shares the sync queue", () => {
    const gate = () => {
      let open!: () => void;
      const promise = new Promise<void>((r) => {
        open = r;
      });
      return { promise, open };
    };
    const flush = () => new Promise((r) => setImmediate(r));

    it("late-finishing disable after timeout does not delete the next account's token", async () => {
      const events: string[] = [];
      const g = gate();
      messaging.getToken.mockResolvedValueOnce("tokenA").mockResolvedValue("tokenB");
      mockUnregister.mockImplementation(async (token) => {
        events.push(`unregister:${token}`);
        await g.promise; // 네트워크가 느려 signOut이 5초에서 포기한 상황
      });
      messaging.deleteToken.mockImplementation(async () => {
        events.push("deleteToken");
      });
      mockRegister.mockImplementation(async (token) => {
        events.push(`register:${token}`);
      });

      const disabling = disablePushOnThisDevice("uA");
      await flush();
      // B가 로그인해 동기화를 시작한다. 해제가 끝날 때까지 기다려야 한다.
      const syncing = syncPushToken("uB");
      await flush();
      expect(events).toEqual(["unregister:tokenA"]);

      g.open();
      await Promise.all([disabling, syncing]);

      expect(events).toEqual(["unregister:tokenA", "deleteToken", "register:tokenB"]);
      expect(readPending()).toBeNull();
    });

    it("sync started during disable does not register", async () => {
      const g = gate();
      messaging.getToken.mockResolvedValue("tokenA");
      mockUnregister.mockImplementation(async () => {
        await g.promise;
      });

      const disabling = disablePushOnThisDevice("uA");
      await flush();
      // 해제 대기가 저장된 뒤, 아직 A의 ID 토큰이 살아 있을 때 A의 동기화가 끼어든다.
      expect(readPending()).not.toBeNull();
      const syncing = syncPushToken("uA");
      await flush();
      g.open();
      await Promise.all([disabling, syncing]);

      expect(mockRegister).not.toHaveBeenCalled();
      expect(messaging.deleteToken).toHaveBeenCalledTimes(1);
      expect(readPending()).toBeNull();
    });

    it("disable waits for an in-flight sync and drops its queued trailing run", async () => {
      const events: string[] = [];
      const g = gate();
      messaging.getToken.mockImplementationOnce(async () => {
        events.push("sync:getToken");
        await g.promise;
        return "t1";
      });
      messaging.getToken.mockImplementation(async () => {
        events.push("getToken");
        return "t1";
      });
      messaging.deleteToken.mockImplementation(async () => {
        events.push("deleteToken");
      });
      mockRegister.mockImplementation(async (token) => {
        events.push(`register:${token}`);
      });

      const first = syncPushToken("uA");
      const trailing = syncPushToken("uA");
      const disabling = disablePushOnThisDevice("uA");
      await flush();
      expect(events).toEqual(["sync:getToken"]);
      g.open();
      await Promise.all([first, trailing, disabling]);

      expect(events).toEqual(["sync:getToken", "register:t1", "getToken", "deleteToken"]);
    });
  });

  describe("syncPushToken", () => {
    it("sync does nothing without permission", async () => {
      messaging.hasPermission.mockResolvedValue(AuthorizationStatus.DENIED);

      await syncPushToken("u1");

      expect(messaging.getToken).not.toHaveBeenCalled();
      expect(messaging.deleteToken).not.toHaveBeenCalled();
      expect(mockRegister).not.toHaveBeenCalled();
      expect(mockUnregister).not.toHaveBeenCalled();
    });

    it("sync processes pending release without permission and does not register", async () => {
      messaging.hasPermission.mockResolvedValue(AuthorizationStatus.DENIED);
      seedPending({ token: "old", uid: "u1", serverDeleted: false, deviceDeleted: false });

      await syncPushToken("u1");

      expect(messaging.deleteToken).toHaveBeenCalledTimes(1);
      expect(mockUnregister).toHaveBeenCalledWith("old");
      expect(readPending()).toBeNull();
      expect(messaging.getToken).not.toHaveBeenCalled();
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it("sync registers token with Platform.OS", async () => {
      await syncPushToken("u1");

      expect(mockRegister).toHaveBeenCalledWith("new-token", Platform.OS);
      expect(messaging.deleteToken).not.toHaveBeenCalled();
    });

    it("pending device delete blocks register", async () => {
      seedPending({ token: "old", uid: "u1", serverDeleted: false, deviceDeleted: false });
      messaging.deleteToken.mockRejectedValue(new Error("offline"));

      await expect(syncPushToken("u2")).rejects.toThrow("offline");

      expect(messaging.getToken).not.toHaveBeenCalled();
      expect(mockRegister).not.toHaveBeenCalled();
      // 다음 동기화가 다시 시도하도록 대기가 그대로 남는다.
      expect(readPending()).toEqual({ token: "old", uid: "u1", serverDeleted: false, deviceDeleted: false });
    });

    it("pending other uid: device delete then clear without server delete", async () => {
      seedPending({ token: "old", uid: "u1", serverDeleted: false, deviceDeleted: false });
      const order: string[] = [];
      messaging.deleteToken.mockImplementation(async () => {
        order.push("deleteToken");
      });
      messaging.getToken.mockImplementation(async () => {
        order.push("getToken");
        return "new-token";
      });

      await syncPushToken("u2");

      expect(order).toEqual(["deleteToken", "getToken"]);
      expect(mockUnregister).not.toHaveBeenCalled();
      expect(readPending()).toBeNull();
      expect(mockRegister).toHaveBeenCalledWith("new-token", Platform.OS);
    });

    it("pending same uid: retries server delete then registers new token", async () => {
      seedPending({ token: "old", uid: "u1", serverDeleted: false, deviceDeleted: true });
      const order: string[] = [];
      mockUnregister.mockImplementation(async (token) => {
        order.push(`unregister:${token}`);
      });
      mockRegister.mockImplementation(async (token) => {
        order.push(`register:${token}`);
      });

      await syncPushToken("u1");

      // 기기 토큰은 이미 지웠으니 다시 지우지 않는다.
      expect(messaging.deleteToken).not.toHaveBeenCalled();
      expect(order).toEqual(["unregister:old", "register:new-token"]);
      expect(readPending()).toBeNull();
    });

    it("pending same uid: server delete failure blocks register and keeps device flag", async () => {
      seedPending({ token: "old", uid: "u1", serverDeleted: false, deviceDeleted: false });
      mockUnregister.mockRejectedValue(new Error("offline"));

      await expect(syncPushToken("u1")).rejects.toThrow("offline");

      expect(mockRegister).not.toHaveBeenCalled();
      expect(readPending()).toEqual({ token: "old", uid: "u1", serverDeleted: false, deviceDeleted: true });
    });

    it("pending with empty token: retries device delete and skips server delete", async () => {
      seedPending({ token: "", uid: "u1", serverDeleted: false, deviceDeleted: false });

      await syncPushToken("u1");

      expect(messaging.deleteToken).toHaveBeenCalledTimes(1);
      expect(mockUnregister).not.toHaveBeenCalled();
      expect(readPending()).toBeNull();
      expect(mockRegister).toHaveBeenCalledWith("new-token", Platform.OS);
    });

    it("corrupt pending is treated as device delete required", async () => {
      store.set(PENDING_KEY, "{not json");
      const order: string[] = [];
      messaging.deleteToken.mockImplementation(async () => {
        order.push("deleteToken");
      });
      mockRegister.mockImplementation(async () => {
        order.push("register");
      });

      await syncPushToken("u1");

      expect(order).toEqual(["deleteToken", "register"]);
      expect(mockUnregister).not.toHaveBeenCalled();
      expect(readPending()).toBeNull();
    });
  });

  describe("enablePushOnThisDevice", () => {
    it("granted면 토큰을 등록하고 권한 변경을 알린다", async () => {
      const listener = jest.fn();
      const unsubscribe = subscribePushPermissionChanged(listener);

      await expect(enablePushOnThisDevice("u1")).resolves.toBe("granted");

      expect(mockRegister).toHaveBeenCalledWith("new-token", Platform.OS);
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
      notifyPushPermissionChanged();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("denied면 등록하지 않는다", async () => {
      messaging.requestPermission.mockResolvedValue(AuthorizationStatus.DENIED);
      messaging.hasPermission.mockResolvedValue(AuthorizationStatus.DENIED);

      await expect(enablePushOnThisDevice("u1")).resolves.toBe("denied");

      expect(mockRegister).not.toHaveBeenCalled();
    });
  });

  describe("disablePushOnThisDevice", () => {
    it("disable offline keeps pending with flags", async () => {
      messaging.getToken.mockResolvedValue("cur-token");
      mockUnregister.mockRejectedValue(new Error("offline"));

      await expect(disablePushOnThisDevice("u1")).rejects.toThrow("offline");

      expect(messaging.deleteToken).toHaveBeenCalled();
      expect(readPending()).toEqual({ token: "cur-token", uid: "u1", serverDeleted: false, deviceDeleted: true });
    });

    it("disable success clears pending", async () => {
      messaging.getToken.mockResolvedValue("cur-token");

      await disablePushOnThisDevice("u1");

      expect(mockUnregister).toHaveBeenCalledWith("cur-token");
      expect(messaging.deleteToken).toHaveBeenCalled();
      expect(readPending()).toBeNull();
    });

    it("disable saves pending before server delete", async () => {
      messaging.getToken.mockResolvedValue("cur-token");
      let pendingAtUnregister: ReleasePending | null = null;
      mockUnregister.mockImplementation(async () => {
        pendingAtUnregister = readPending();
      });

      await disablePushOnThisDevice("u1");

      expect(pendingAtUnregister).toEqual({ token: "cur-token", uid: "u1", serverDeleted: false, deviceDeleted: false });
    });

    it("disable device delete failure keeps pending and rethrows", async () => {
      messaging.getToken.mockResolvedValue("cur-token");
      messaging.deleteToken.mockRejectedValue(new Error("device"));

      await expect(disablePushOnThisDevice("u1")).rejects.toThrow("device");

      expect(readPending()).toEqual({ token: "cur-token", uid: "u1", serverDeleted: true, deviceDeleted: false });
    });

    it("disable getToken failure: still deletes device token, no pending when it succeeds", async () => {
      messaging.getToken.mockRejectedValue(new Error("no token"));

      await expect(disablePushOnThisDevice("u1")).rejects.toThrow("no token");

      expect(mockUnregister).not.toHaveBeenCalled();
      expect(messaging.deleteToken).toHaveBeenCalled();
      expect(readPending()).toBeNull();
    });

    it("disable getToken and deleteToken failure: persists empty-token pending", async () => {
      messaging.getToken.mockRejectedValue(new Error("no token"));
      messaging.deleteToken.mockRejectedValue(new Error("device"));

      await expect(disablePushOnThisDevice("u1")).rejects.toThrow("no token");

      expect(mockUnregister).not.toHaveBeenCalled();
      expect(readPending()).toEqual({ token: "", uid: "u1", serverDeleted: false, deviceDeleted: false });
    });

    it("disable releases even when permission denied", async () => {
      messaging.hasPermission.mockResolvedValue(AuthorizationStatus.DENIED);
      messaging.getToken.mockResolvedValue("cur-token");

      await disablePushOnThisDevice("u1");

      expect(mockUnregister).toHaveBeenCalledWith("cur-token");
      expect(messaging.deleteToken).toHaveBeenCalled();
      expect(readPending()).toBeNull();
    });

    it("disable releases even when hasPermission throws", async () => {
      messaging.hasPermission.mockRejectedValue(new Error("native"));
      messaging.getToken.mockResolvedValue("cur-token");

      await disablePushOnThisDevice("u1");

      expect(mockUnregister).toHaveBeenCalledWith("cur-token");
      expect(messaging.deleteToken).toHaveBeenCalled();
    });

    it("disable still deletes device token when AsyncStorage setItem rejects", async () => {
      messaging.getToken.mockResolvedValue("cur-token");
      setItem.mockRejectedValue(new Error("storage full"));

      await expect(disablePushOnThisDevice("u1")).rejects.toThrow("storage full");

      expect(mockUnregister).toHaveBeenCalledWith("cur-token");
      expect(messaging.deleteToken).toHaveBeenCalled();
    });

    it("disable getToken failure with storage failure still deletes device token", async () => {
      messaging.getToken.mockRejectedValue(new Error("no token"));
      setItem.mockRejectedValue(new Error("storage full"));

      await expect(disablePushOnThisDevice("u1")).rejects.toThrow("no token");

      expect(messaging.deleteToken).toHaveBeenCalled();
    });
  });
});
