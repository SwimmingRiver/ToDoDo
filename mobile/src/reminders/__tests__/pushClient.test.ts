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

  describe("syncPushToken", () => {
    it("sync does nothing without permission", async () => {
      messaging.hasPermission.mockResolvedValue(AuthorizationStatus.DENIED);
      seedPending({ token: "old", uid: "u1", serverDeleted: false, deviceDeleted: false });

      await syncPushToken("u1");

      expect(messaging.getToken).not.toHaveBeenCalled();
      expect(messaging.deleteToken).not.toHaveBeenCalled();
      expect(mockRegister).not.toHaveBeenCalled();
      expect(mockUnregister).not.toHaveBeenCalled();
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

    it("disable does nothing without permission", async () => {
      messaging.hasPermission.mockResolvedValue(AuthorizationStatus.NOT_DETERMINED);

      await disablePushOnThisDevice("u1");

      expect(messaging.getToken).not.toHaveBeenCalled();
      expect(messaging.deleteToken).not.toHaveBeenCalled();
      expect(readPending()).toBeNull();
    });
  });
});
