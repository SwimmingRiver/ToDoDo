import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Platform } from "react-native";

const mockGetIdToken = jest.fn<() => Promise<string>>();
let mockProviderIds: string[] = ["google.com"];
const mockAuth = {
  currentUser: {
    uid: "u1",
    getIdToken: () => mockGetIdToken(),
    get providerData() {
      return mockProviderIds.map((providerId) => ({ providerId }));
    },
  },
};
jest.mock("../../firebase", () => ({ auth: mockAuth, db: {} }));

// Apple 해지: 실제 revokeAppleSignIn을 쓰고 네이티브 창만 목으로 둔다(해지 요청은 fetch로 나간다).
const mockSignInAsync = jest.fn<(options: unknown) => Promise<{ authorizationCode: string | null }>>();
jest.mock("expo-apple-authentication", () => ({
  signInAsync: (options: unknown) => mockSignInAsync(options),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock("expo-crypto", () => ({}));
jest.mock("firebase/auth", () => ({}));
const REVOKE_URL_PART = "identitytoolkit.googleapis.com/v2/accounts:revokeToken";
const isRevokeCall = (url: unknown) => String(url).includes(REVOKE_URL_PART);

const mockGetDocs = jest.fn<() => Promise<{ docs: { data: () => Record<string, unknown> }[] }>>();
jest.mock("firebase/firestore", () => ({
  collection: () => "todosRef",
  where: () => "whereClause",
  query: () => "q",
  getDocs: () => mockGetDocs(),
}));

const mockLoadSnapshot = jest.fn<(uid: string) => Promise<Map<string, { title: string; dueAt: string; googleEventId: string }>>>();
const mockClearSnapshot = jest.fn<(uid: string) => Promise<void>>();
jest.mock("../../calendarIntegration/snapshotStorage", () => {
  const core = jest.requireActual("@tododo/core/dist/calendarSync/index.js") as Record<string, unknown>;
  return {
    loadSnapshot: (uid: string) => mockLoadSnapshot(uid),
    clearSnapshot: (uid: string) => mockClearSnapshot(uid),
    findOrphanGoogleEventIds: core.findOrphanGoogleEventIds,
  };
});

const ENV_KEYS = ["EXPO_PUBLIC_CALENDAR_PROXY_URL", "EXPO_PUBLIC_REMINDER_PROXY_URL", "EXPO_PUBLIC_BILLING_PROXY_URL"] as const;

// 실제 pushClient 큐를 쓴다(탈퇴 중 동기화가 끼어드는지 보려면 큐 동작이 필요하다). 저장소만 메모리로 둔다.
const mockStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: async (key: string) => mockStore.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    mockStore.set(key, value);
  },
  removeItem: async (key: string) => {
    mockStore.delete(key);
  },
}));

const fetchMock = jest.fn<typeof fetch>();
const messagingMock = jest.requireMock("@react-native-firebase/messaging") as {
  deleteToken: jest.Mock<() => Promise<void>>;
  hasPermission: jest.Mock<() => Promise<number>>;
};
const isRegisterCall = ([url, init]: Parameters<typeof fetch>) =>
  String(url) === "https://rem.example/push-tokens" && init?.method === "POST";
const flushAsync = () => new Promise((r) => setImmediate(r));

describe("deleteAccount", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_CALENDAR_PROXY_URL = "https://cal.example";
    process.env.EXPO_PUBLIC_REMINDER_PROXY_URL = "https://rem.example";
    process.env.EXPO_PUBLIC_BILLING_PROXY_URL = "https://bill.example";
    mockGetIdToken.mockResolvedValue("id-token");
    mockGetDocs.mockResolvedValue({ docs: [{ data: () => ({ googleEventId: "ev_1" }) }, { data: () => ({ googleEventId: null }) }] });
    mockLoadSnapshot.mockReset().mockResolvedValue(new Map());
    mockClearSnapshot.mockReset().mockResolvedValue(undefined);
    fetchMock.mockReset().mockImplementation(async () => new Response(null, { status: 204 }));
    global.fetch = fetchMock;
    mockProviderIds = ["google.com"];
    mockSignInAsync.mockReset().mockResolvedValue({ authorizationCode: "auth-code" });
    messagingMock.deleteToken.mockReset().mockResolvedValue(undefined);
    messagingMock.hasPermission.mockReset().mockResolvedValue(1);
    mockStore.clear();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("캘린더 → 알림 → 결제 서버 순서로 ID 토큰을 붙여 호출한다", async () => {
    const { deleteAccount } = await import("../deleteAccount");
    await deleteAccount();

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual(["https://cal.example/disconnect", "https://rem.example/account", "https://bill.example/account/delete"]);
    const [, calendarInit] = fetchMock.mock.calls[0];
    expect(calendarInit?.method).toBe("POST");
    expect(JSON.parse(calendarInit?.body as string)).toEqual({ googleEventIds: ["ev_1"] });
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
    expect(fetchMock.mock.calls[2][1]?.method).toBe("POST");
    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer id-token");
    }
  });

  it("deleteAccount deletes device token", async () => {
    const order: string[] = [];
    fetchMock.mockImplementation(async (url) => {
      order.push(String(url));
      return new Response(null, { status: 204 });
    });
    messagingMock.deleteToken.mockImplementation(async () => {
      order.push("deleteToken");
    });
    const { deleteAccount } = await import("../deleteAccount");
    await deleteAccount();

    // 기기 토큰은 pushClient 큐에서 알림 저장소(DELETE /account)보다 먼저 지운다 — 그 사이 동기화가 끼어들 틈이 없다.
    expect(order.indexOf("deleteToken")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("deleteToken")).toBeLessThan(order.indexOf("https://rem.example/account"));
  });

  it("탈퇴 중·후에 온 동기화(onTokenRefresh 등)가 삭제된 계정에 토큰을 다시 등록하지 않는다", async () => {
    const { syncPushToken } = await import("../../reminders/push/pushClient");
    fetchMock.mockImplementation(async (url) => {
      // 알림 저장소를 지우는 바로 그 순간 FCM이 토큰을 새로 발급해 훅이 동기화를 부른다.
      if (String(url) === "https://rem.example/account") await syncPushToken("u1");
      return new Response(null, { status: 204 });
    });
    const { deleteAccount } = await import("../deleteAccount");
    await deleteAccount();
    await syncPushToken("u1");
    await flushAsync();

    expect(fetchMock.mock.calls.filter(isRegisterCall)).toHaveLength(0);
  });

  it("탈퇴가 중간에 실패하면 래치를 풀고 토큰을 다시 등록한다(계정이 그대로 남는다)", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url) === "https://bill.example/account/delete" ? new Response(null, { status: 500 }) : new Response(null, { status: 204 }),
    );
    const { deleteAccount } = await import("../deleteAccount");
    await expect(deleteAccount()).rejects.toThrow("billing-proxy");
    await flushAsync();

    expect(fetchMock.mock.calls.filter(isRegisterCall)).toHaveLength(1);
  });

  it("기기 토큰 삭제가 실패해도 탈퇴는 계속 진행한다", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    messagingMock.deleteToken.mockRejectedValue(new Error("device"));
    const { deleteAccount } = await import("../deleteAccount");
    await deleteAccount();

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain("https://bill.example/account/delete");
    expect(mockClearSnapshot).toHaveBeenCalledWith("u1");
  });

  it("앱 스냅샷에만 남은 고아 이벤트 id도 함께 보내고(중복 없이), 성공하면 스냅샷을 지운다", async () => {
    mockLoadSnapshot.mockResolvedValue(
      new Map([
        ["t_deleted", { title: "지운 할 일", dueAt: "2026-11-20", googleEventId: "ev_orphan" }],
        ["t_live", { title: "남은 할 일", dueAt: "2026-11-21", googleEventId: "ev_1" }],
      ]),
    );
    const { deleteAccount } = await import("../deleteAccount");
    await deleteAccount();

    expect(mockLoadSnapshot).toHaveBeenCalledWith("u1");
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as { googleEventIds: string[] };
    expect([...body.googleEventIds].sort()).toEqual(["ev_1", "ev_orphan"]);
    expect(mockClearSnapshot).toHaveBeenCalledWith("u1");
  });

  it("실패하면 스냅샷을 지우지 않는다(재시도 때 고아 id가 필요하다)", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { deleteAccount } = await import("../deleteAccount");
    await expect(deleteAccount()).rejects.toThrow("billing-proxy");
    expect(mockClearSnapshot).not.toHaveBeenCalled();
  });

  it("중간 단계가 실패하면 멈추고 던진다", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { deleteAccount } = await import("../deleteAccount");
    await expect(deleteAccount()).rejects.toThrow("reminder-proxy /account 실패 (500)");
    await flushAsync();
    // 실패 뒤 다시 등록하는 동기화 호출은 빼고 센다.
    expect(fetchMock.mock.calls.filter((call) => !isRegisterCall(call))).toHaveLength(2);
  });

  it("서버 주소가 비어 있으면 아무것도 호출하지 않고 던진다", async () => {
    delete process.env.EXPO_PUBLIC_BILLING_PROXY_URL;
    const { deleteAccount } = await import("../deleteAccount");
    await expect(deleteAccount()).rejects.toThrow("EXPO_PUBLIC_BILLING_PROXY_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 무료 플랜 Worker는 요청당 서브리퀘스트 50개 — 이벤트를 10개씩 나눠 지우고, 탈퇴는 반드시
  // 마지막 요청에서 토큰까지 지운 뒤 다음 단계로 간다.
  it("캘린더 이벤트가 많으면 10개씩 keepToken:true로 나눠 보내고 마지막 요청에서 토큰을 지운다", async () => {
    mockGetDocs.mockResolvedValue({
      docs: Array.from({ length: 23 }, (_, i) => ({ data: () => ({ googleEventId: `ev_${i}` }) })),
    });
    const { deleteAccount } = await import("../deleteAccount");
    await deleteAccount();

    const calendarCalls = fetchMock.mock.calls.filter(([url]) => url === "https://cal.example/disconnect");
    const bodies = calendarCalls.map(([, init]) => JSON.parse(init?.body as string));
    expect(bodies.map((b) => [b.googleEventIds.length, b.keepToken])).toEqual([
      [10, true],
      [10, true],
      [3, undefined],
    ]);
    expect(fetchMock.mock.calls.map(([url]) => url).slice(3)).toEqual([
      "https://rem.example/account",
      "https://bill.example/account/delete",
    ]);
  });

  it("캘린더 묶음 중간이 실패하면 멈추고(토큰 남음) 다음 단계로 가지 않는다", async () => {
    mockGetDocs.mockResolvedValue({
      docs: Array.from({ length: 23 }, (_, i) => ({ data: () => ({ googleEventId: `ev_${i}` }) })),
    });
    fetchMock
      .mockImplementationOnce(async () => new Response(null, { status: 204 }))
      .mockImplementationOnce(async () => new Response(null, { status: 500 }));
    const { deleteAccount } = await import("../deleteAccount");

    await expect(deleteAccount()).rejects.toThrow(/calendar-proxy/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockClearSnapshot).not.toHaveBeenCalled();
  });
  describe("Apple 로그인 사용자", () => {
    beforeEach(() => {
      mockProviderIds = ["apple.com"];
    });

    const workerCalls = () => fetchMock.mock.calls.filter(([url]) => !isRevokeCall(url));

    it("다른 어떤 서버 호출보다 먼저 Apple 토큰을 tokenType CODE로 해지한다", async () => {
      const { deleteAccount } = await import("../deleteAccount");
      await deleteAccount();

      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls[0]).toContain(REVOKE_URL_PART);
      expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
        providerId: "apple.com",
        tokenType: "CODE",
        token: "auth-code",
        idToken: "id-token",
      });
      expect(urls).toHaveLength(4);
    });

    it("해지가 실패하면 아무 단계도 부르지 않고 AppleRevokeError를 던진다", async () => {
      fetchMock.mockImplementation(async (url) => new Response(null, { status: isRevokeCall(url) ? 400 : 204 }));
      const { deleteAccount, AppleRevokeError } = await import("../deleteAccount");
      await expect(deleteAccount()).rejects.toBeInstanceOf(AppleRevokeError);
      expect(workerCalls()).toHaveLength(0);
      expect(mockClearSnapshot).not.toHaveBeenCalled();
    });

    it("Apple 인증 코드를 못 받아도 AppleRevokeError로 던진다", async () => {
      mockSignInAsync.mockResolvedValue({ authorizationCode: null });
      const { deleteAccount, AppleRevokeError } = await import("../deleteAccount");
      await expect(deleteAccount()).rejects.toBeInstanceOf(AppleRevokeError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("Apple 확인 창을 닫으면 그 취소 오류를 그대로 던지고 아무것도 지우지 않는다", async () => {
      const cancelled = Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" });
      mockSignInAsync.mockRejectedValue(cancelled);
      const { deleteAccount } = await import("../deleteAccount");
      await expect(deleteAccount()).rejects.toBe(cancelled);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("Apple 단계가 끝난 뒤의 실패는 AppleRevokeError가 아니다", async () => {
      fetchMock.mockImplementation(async (url) =>
        new Response(null, { status: String(url).startsWith("https://rem.example") ? 500 : 200 }),
      );
      const { deleteAccount, AppleRevokeError } = await import("../deleteAccount");
      const error = await deleteAccount().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(AppleRevokeError);
    });
  });

  it("Android에서는 Apple 연결 계정도 해지를 건너뛰고 정상 순서로 탈퇴한다", async () => {
    mockProviderIds = ["apple.com", "google.com"];
    const restore = jest.replaceProperty(Platform, "OS", "android");
    try {
      const { deleteAccount } = await import("../deleteAccount");
      await deleteAccount();
      expect(mockSignInAsync).not.toHaveBeenCalled();
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        "https://cal.example/disconnect",
        "https://rem.example/account",
        "https://bill.example/account/delete",
      ]);
    } finally {
      restore.restore();
    }
  });

  it("구글 사용자는 Apple 확인 창을 열지 않는다", async () => {
    const { deleteAccount } = await import("../deleteAccount");
    await deleteAccount();
    expect(mockSignInAsync).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => isRevokeCall(url))).toBe(false);
  });
});
