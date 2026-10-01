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
import { onPushPermissionChanged } from "../pushSupport";

const registration = { scope: "/firebase-cloud-messaging-push-scope", active: { state: "activated" } };
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
  // 테스트가 남긴 ...Once 큐·구현 교체가 다음 테스트로 새지 않게 기본값으로 되돌린다.
  m.getToken.mockReset().mockResolvedValue("fcm-token");
  m.deleteToken.mockReset().mockResolvedValue(true);
  m.register.mockResolvedValue(undefined);
  m.unregister.mockResolvedValue(undefined);
  localStorage.clear();
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

  it("권한 요청 결과가 나오면 권한 변경 신호를 보낸다", async () => {
    installPush("default", "granted");
    const listener = vi.fn();
    const off = onPushPermissionChanged(listener);
    await enablePushOnThisDevice();
    off();
    expect(listener).toHaveBeenCalledTimes(1);
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

  it("Worker 해제가 실패해도 FCM 토큰은 삭제하고 에러는 다시 던진다", async () => {
    installPush("granted");
    m.unregister.mockRejectedValueOnce(new Error("worker down"));
    await expect(disablePushOnThisDevice()).rejects.toThrow("worker down");
    expect(m.deleteToken).toHaveBeenCalled();
  });

  it("granted가 아니면 아무것도 안 한다", async () => {
    installPush("denied");
    await disablePushOnThisDevice();
    expect(m.getToken).not.toHaveBeenCalled();
  });
});

// 로그아웃 정리가 오프라인 등으로 실패하면 FCM 토큰이 살아 있는 채 이전 계정 DO에 남는다.
// 그 상태로 다음 계정이 같은 토큰을 등록하면 이전 계정의 알림(할 일 제목)이 이 브라우저에 뜬다.
describe("로그아웃 정리 실패 복구", () => {
  it("로그아웃 때 토큰 삭제까지 실패하면 다음 동기화는 옛 토큰을 지운 뒤 새 토큰을 등록한다", async () => {
    installPush("granted");
    m.unregister.mockRejectedValueOnce(new Error("offline"));
    m.deleteToken.mockRejectedValueOnce(new Error("offline"));
    await expect(disablePushOnThisDevice()).rejects.toThrow("offline");

    m.deleteToken.mockImplementationOnce(async () => {
      m.getToken.mockResolvedValue("fcm-token-new");
      return true;
    });
    await syncPushToken();
    expect(m.register).toHaveBeenCalledTimes(1);
    expect(m.register).toHaveBeenCalledWith("fcm-token-new");
  });

  it("토큰 조회부터 실패해도 다음 동기화에서 옛 토큰을 지운다", async () => {
    installPush("granted");
    m.getToken.mockRejectedValueOnce(new Error("offline"));
    await expect(disablePushOnThisDevice()).rejects.toThrow("offline");

    await syncPushToken();
    expect(m.deleteToken).toHaveBeenCalledTimes(1);
    expect(m.deleteToken.mock.invocationCallOrder[0]).toBeLessThan(m.register.mock.invocationCallOrder[0]);
  });

  it("옛 토큰 삭제가 또 실패하면 등록하지 않고, 다음 동기화에서 다시 시도한다", async () => {
    installPush("granted");
    m.getToken.mockRejectedValueOnce(new Error("offline"));
    await expect(disablePushOnThisDevice()).rejects.toThrow();

    m.deleteToken.mockRejectedValueOnce(new Error("offline"));
    await expect(syncPushToken()).rejects.toThrow("offline");
    expect(m.register).not.toHaveBeenCalled();

    await syncPushToken();
    expect(m.deleteToken).toHaveBeenCalledTimes(2);
    expect(m.register).toHaveBeenCalledTimes(1);
  });

  it("로그아웃 정리가 성공했으면 다음 동기화에서 토큰을 지우지 않는다", async () => {
    installPush("granted");
    await disablePushOnThisDevice();
    await syncPushToken();
    expect(m.deleteToken).toHaveBeenCalledTimes(1);
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

// 운영 Sentry TODODO-CLIENT-2: 새로 등록된 워커가 활성화되기 전에 getToken(→ pushManager.subscribe)을
// 부르면 "no active Service Worker"로 실패해, 첫 "알림 켜기"에서 토큰이 등록되지 않았다.
describe("서비스 워커 활성화 대기", () => {
  it("등록 직후 설치 중이면 활성화된 뒤에야 토큰을 요청한다", async () => {
    installPush("default", "granted");
    const installing = Object.assign(new EventTarget(), { state: "installing" });
    const fresh = { scope: "/firebase-cloud-messaging-push-scope", active: null, installing };
    vi.mocked(navigator.serviceWorker.register).mockResolvedValueOnce(
      fresh as unknown as ServiceWorkerRegistration,
    );

    const pending = enablePushOnThisDevice();
    await vi.waitFor(() => expect(navigator.serviceWorker.register).toHaveBeenCalled());
    await Promise.resolve();
    expect(m.getToken).not.toHaveBeenCalled();

    installing.state = "activated";
    installing.dispatchEvent(new Event("statechange"));
    expect(await pending).toBe("granted");
    expect(m.getToken).toHaveBeenCalledTimes(1);
    expect(m.register).toHaveBeenCalledWith("fcm-token");
  });
});
