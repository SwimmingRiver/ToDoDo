import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
const mockDisconnect = vi.fn(async (_ids: string[]) => {
  calls.push("calendar");
  return { deletedGoogleEventIds: [] };
});
const mockReminder = vi.fn(async () => void calls.push("reminder"));
const mockServer = vi.fn(async () => void calls.push("server"));

vi.mock("@/features/calendarIntegration/api", () => ({ disconnectCalendar: (ids: string[]) => mockDisconnect(ids) }));
vi.mock("@/features/reminders/api/reminderProxyApi", () => ({ deleteReminderAccount: () => mockReminder() }));
vi.mock("@/features/billing/api/billingApi", () => ({ deleteAccountOnServer: () => mockServer() }));
const fakeAuth = { currentUser: { uid: "u1", providerData: [{ providerId: "google.com" }] as { providerId: string }[] } };
vi.mock("@/shared/lib/firebase", () => ({ auth: fakeAuth, appleProvider: { providerId: "apple.com" } }));

const mockReauth = vi.fn(async (..._args: unknown[]) => {
  calls.push("reauth");
  return { user: {} };
});
const mockRevoke = vi.fn(async (..._args: unknown[]) => void calls.push("revoke"));
const mockCredential = vi.fn((_r: unknown): { accessToken?: string } | null => ({ accessToken: "apple-access-token" }));
vi.mock("firebase/auth", () => ({
  browserPopupRedirectResolver: "resolver",
  reauthenticateWithPopup: (...args: unknown[]) => mockReauth(...args),
  revokeAccessToken: (...args: unknown[]) => mockRevoke(...args),
  OAuthProvider: { credentialFromResult: (r: unknown) => mockCredential(r) },
}));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));

const mockGetDocs = vi.fn();
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "todosRef"),
  where: vi.fn(() => "whereClause"),
  query: vi.fn(() => "q"),
  getDocs: () => mockGetDocs(),
}));

vi.mock("@/features/calendarIntegration/hooks/syncSnapshot", () => ({
  loadSnapshot: () => new Map([["gone", { updatedAt: "x", googleEventId: "ev_orphan" }]]),
  findOrphanGoogleEventIds: (snapshot: Map<string, { googleEventId: string | null }>, tracked: Iterable<string>) => {
    const set = new Set(tracked);
    return [...snapshot.values()].flatMap((e) => (e.googleEventId && !set.has(e.googleEventId) ? [e.googleEventId] : []));
  },
}));

const docsWith = (...data: Record<string, unknown>[]) => ({ docs: data.map((d) => ({ data: () => d })) });

describe("deleteAccount", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
    fakeAuth.currentUser.providerData = [{ providerId: "google.com" }];
    mockCredential.mockReturnValue({ accessToken: "apple-access-token" });
    mockGetDocs.mockResolvedValue(docsWith({ googleEventId: "ev_1" }, { googleEventId: null }, {}));
  });

  it("캘린더 → 알림 → 서버 순서로 부르고, 할 일 + 스냅샷 고아 이벤트 id를 보낸다", async () => {
    const { deleteAccount } = await import("../deleteAccount");
    await deleteAccount();
    expect(calls).toEqual(["calendar", "reminder", "server"]);
    expect(mockDisconnect).toHaveBeenCalledWith(["ev_1", "ev_orphan"]);
  });

  it("중간 단계가 실패하면 거기서 멈추고 던진다", async () => {
    mockReminder.mockRejectedValueOnce(new Error("reminder down"));
    const { deleteAccount } = await import("../deleteAccount");
    await expect(deleteAccount()).rejects.toThrow("reminder down");
    expect(mockServer).not.toHaveBeenCalled();
  });
  it("단계가 바뀔 때마다 onStep으로 알린다(각 단계 호출 직전)", async () => {
    const { deleteAccount } = await import("../deleteAccount");
    const onStep = vi.fn((step: string) => void calls.push(`step:${step}`));
    await deleteAccount(onStep);
    expect(calls).toEqual(["step:calendar", "calendar", "step:reminders", "reminder", "step:account", "server"]);
  });

  describe("Apple 사용자", () => {
    beforeEach(() => {
      fakeAuth.currentUser.providerData = [{ providerId: "google.com" }, { providerId: "apple.com" }];
    });

    it("재인증이 다른 비동기 호출보다 먼저(팝업 차단 방지) 불리고 토큰을 해지한 뒤 기존 단계를 진행한다", async () => {
      mockGetDocs.mockImplementation(async () => {
        calls.push("getDocs");
        return docsWith();
      });
      const { deleteAccount } = await import("../deleteAccount");
      await deleteAccount();
      expect(calls).toEqual(["reauth", "revoke", "getDocs", "calendar", "reminder", "server"]);
      expect(mockReauth).toHaveBeenCalledWith(fakeAuth.currentUser, { providerId: "apple.com" }, "resolver");
      expect(mockRevoke).toHaveBeenCalledWith(fakeAuth, "apple-access-token");
    });

    it("재인증 직전까지 await 없이 동기로 도달한다", async () => {
      const { deleteAccount } = await import("../deleteAccount");
      const onStep = vi.fn();
      const p = deleteAccount(onStep);
      expect(onStep).toHaveBeenCalledWith("apple");
      expect(mockReauth).toHaveBeenCalledTimes(1);
      await p;
    });

    it("재인증 창을 닫으면(취소) 그 오류로 reject되고 아무것도 지우지 않는다", async () => {
      const cancelErr = Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" });
      mockReauth.mockRejectedValueOnce(cancelErr);
      const { deleteAccount } = await import("../deleteAccount");
      await expect(deleteAccount()).rejects.toBe(cancelErr);
      expect(mockRevoke).not.toHaveBeenCalled();
      expect(mockGetDocs).not.toHaveBeenCalled();
      expect(mockDisconnect).not.toHaveBeenCalled();
      expect(mockReminder).not.toHaveBeenCalled();
      expect(mockServer).not.toHaveBeenCalled();
    });

    it("해지가 실패하면 뒤 단계를 하나도 부르지 않고 던진다", async () => {
      mockRevoke.mockRejectedValueOnce(new Error("revoke fail"));
      const { deleteAccount } = await import("../deleteAccount");
      await expect(deleteAccount()).rejects.toThrow("revoke fail");
      expect(mockDisconnect).not.toHaveBeenCalled();
      expect(mockReminder).not.toHaveBeenCalled();
      expect(mockServer).not.toHaveBeenCalled();
    });

    it("재인증 결과에 토큰이 없으면 뒤 단계를 부르지 않고 던진다", async () => {
      mockCredential.mockReturnValue(null);
      const { deleteAccount } = await import("../deleteAccount");
      await expect(deleteAccount()).rejects.toThrow("Apple 토큰을 받지 못했습니다");
      expect(mockRevoke).not.toHaveBeenCalled();
      expect(mockDisconnect).not.toHaveBeenCalled();
      expect(mockReminder).not.toHaveBeenCalled();
      expect(mockServer).not.toHaveBeenCalled();
    });
  });

  it("Apple 연결이 없는 사용자는 재인증·해지를 하지 않는다", async () => {
    const { deleteAccount } = await import("../deleteAccount");
    await deleteAccount();
    expect(mockReauth).not.toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(calls).toEqual(["calendar", "reminder", "server"]);
  });
});
