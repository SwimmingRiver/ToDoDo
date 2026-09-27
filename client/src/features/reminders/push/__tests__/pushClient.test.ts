import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({
  getMessaging: vi.fn(() => ({ id: "messaging" })),
  getToken: vi.fn(async () => "fcm-token"),
  deleteToken: vi.fn(async () => true),
  onMessage: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
}));
vi.mock("firebase/messaging", () => ({
  getMessaging: m.getMessaging,
  getToken: m.getToken,
  deleteToken: m.deleteToken,
  onMessage: m.onMessage,
}));
vi.mock("@/shared/lib/firebaseApp", () => ({ app: { name: "app" } }));
vi.mock("../../api/reminderProxyApi", () => ({
  registerPushToken: m.register,
  unregisterPushToken: m.unregister,
}));

import {
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getPushPermission,
  subscribeForegroundMessages,
  syncPushToken,
} from "../pushClient";

const registration = { scope: "/firebase-cloud-messaging-push-scope" };
const installPush = (permission: NotificationPermission, requestResult: NotificationPermission = permission) => {
  const NotificationStub = Object.assign(vi.fn(), {
    permission,
    requestPermission: vi.fn(async () => {
      NotificationStub.permission = requestResult;
      return requestResult;
    }),
  });
  vi.stubGlobal("Notification", NotificationStub);
  vi.stubGlobal("PushManager", vi.fn());
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: vi.fn(async () => registration) },
  });
  return NotificationStub;
};

beforeEach(() => {
  vi.stubEnv("VITE_FIREBASE_VAPID_KEY", "vapid");
  Object.values(m).forEach((fn) => fn.mockClear());
  m.register.mockResolvedValue(undefined);
  m.unregister.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  // @ts-expect-error 테스트에서 설치한 속성 제거
  delete navigator.serviceWorker;
});

describe("getPushPermission", () => {
  it("PushManager가 없으면 unsupported(iOS 일반 브라우저)", () => {
    vi.stubGlobal("Notification", { permission: "default" });
    expect(getPushPermission()).toBe("unsupported");
  });

  it("지원하면 Notification.permission", () => {
    installPush("denied");
    expect(getPushPermission()).toBe("denied");
  });
});

describe("enablePushOnThisDevice", () => {
  it("허용되면 서비스 워커를 설정 쿼리와 함께 등록하고 토큰을 Worker에 등록한다", async () => {
    installPush("default", "granted");
    expect(await enablePushOnThisDevice()).toBe("granted");

    const [url, options] = vi.mocked(navigator.serviceWorker.register).mock.calls[0];
    expect(String(url)).toMatch(/^\/firebase-messaging-sw\.js\?/);
    expect(options).toEqual({ scope: "/firebase-cloud-messaging-push-scope" });
    expect(m.getToken).toHaveBeenCalledWith({ id: "messaging" }, {
      vapidKey: "vapid",
      serviceWorkerRegistration: registration,
    });
    expect(m.register).toHaveBeenCalledWith("fcm-token");
  });

  it("거절되면 토큰을 받지 않는다", async () => {
    installPush("default", "denied");
    expect(await enablePushOnThisDevice()).toBe("denied");
    expect(m.getToken).not.toHaveBeenCalled();
  });

  it("미지원이면 권한을 묻지 않는다", async () => {
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn() });
    expect(await enablePushOnThisDevice()).toBe("unsupported");
  });
});

describe("syncPushToken", () => {
  it("granted가 아니면 아무것도 안 한다", async () => {
    installPush("default");
    await syncPushToken();
    expect(m.getToken).not.toHaveBeenCalled();
  });

  it("granted면 토큰을 다시 등록한다", async () => {
    installPush("granted");
    await syncPushToken();
    expect(m.register).toHaveBeenCalledWith("fcm-token");
  });
});

describe("disablePushOnThisDevice", () => {
  it("granted면 Worker에서 해제하고 FCM 토큰을 삭제한다", async () => {
    installPush("granted");
    await disablePushOnThisDevice();
    expect(m.unregister).toHaveBeenCalledWith("fcm-token");
    expect(m.deleteToken).toHaveBeenCalled();
  });

  it("granted가 아니면 아무것도 안 한다", async () => {
    installPush("denied");
    await disablePushOnThisDevice();
    expect(m.getToken).not.toHaveBeenCalled();
  });
});

describe("subscribeForegroundMessages", () => {
  it("granted면 onMessage로 받은 알림을 handler에 넘긴다", async () => {
    installPush("granted");
    const unsubscribe = vi.fn();
    m.onMessage.mockReturnValue(unsubscribe);
    const handler = vi.fn();
    const off = await subscribeForegroundMessages(handler);

    const listener = m.onMessage.mock.calls[0][1] as (p: unknown) => void;
    listener({ notification: { title: "보고서", body: "30분 후 마감이에요" } });
    expect(handler).toHaveBeenCalledWith({ title: "보고서", body: "30분 후 마감이에요" });
    off();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("granted가 아니면 구독하지 않는다", async () => {
    installPush("default");
    const off = await subscribeForegroundMessages(vi.fn());
    expect(m.onMessage).not.toHaveBeenCalled();
    expect(() => off()).not.toThrow();
  });
});
