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
vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "u1" } } }));
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
});
