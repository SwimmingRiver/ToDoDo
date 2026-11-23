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

// Apple 해지: 실제 revokeAppleSignIn을 쓰고 네이티브 창과 Firebase 호출만 목으로 둔다.
const mockSignInAsync = jest.fn<(options: unknown) => Promise<{ authorizationCode: string | null }>>();
jest.mock("expo-apple-authentication", () => ({
  signInAsync: (options: unknown) => mockSignInAsync(options),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock("expo-crypto", () => ({}));
const mockRevokeAccessToken = jest.fn<(auth: unknown, token: string) => Promise<void>>();
jest.mock("firebase/auth", () => ({
  revokeAccessToken: (auth: unknown, token: string) => mockRevokeAccessToken(auth, token),
}));

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

const fetchMock = jest.fn<typeof fetch>();

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
    mockRevokeAccessToken.mockReset().mockResolvedValue(undefined);
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

    it("다른 어떤 서버 호출보다 먼저 Apple 토큰을 해지한다", async () => {
      const order: string[] = [];
      mockRevokeAccessToken.mockImplementation(async () => {
        order.push("revoke");
      });
      fetchMock.mockImplementation(async (url) => {
        order.push(String(url));
        return new Response(null, { status: 204 });
      });
      const { deleteAccount } = await import("../deleteAccount");
      await deleteAccount();

      expect(mockRevokeAccessToken).toHaveBeenCalledWith(mockAuth, "auth-code");
      expect(order[0]).toBe("revoke");
      expect(order).toHaveLength(4);
    });

    it("해지가 실패하면 아무 단계도 부르지 않고 던진다", async () => {
      mockRevokeAccessToken.mockRejectedValue(new Error("revoke"));
      const { deleteAccount } = await import("../deleteAccount");
      await expect(deleteAccount()).rejects.toThrow("revoke");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockClearSnapshot).not.toHaveBeenCalled();
    });

    it("Apple 확인 창을 닫으면 그 취소 오류를 그대로 던지고 아무것도 지우지 않는다", async () => {
      const cancelled = Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" });
      mockSignInAsync.mockRejectedValue(cancelled);
      const { deleteAccount } = await import("../deleteAccount");
      await expect(deleteAccount()).rejects.toBe(cancelled);
      expect(mockRevokeAccessToken).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("Android에서는 Apple 연결 계정도 해지를 건너뛰고 정상 순서로 탈퇴한다", async () => {
    mockProviderIds = ["apple.com", "google.com"];
    const restore = jest.replaceProperty(Platform, "OS", "android");
    try {
      const { deleteAccount } = await import("../deleteAccount");
      await deleteAccount();
      expect(mockSignInAsync).not.toHaveBeenCalled();
      expect(mockRevokeAccessToken).not.toHaveBeenCalled();
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
    expect(mockRevokeAccessToken).not.toHaveBeenCalled();
  });
});
