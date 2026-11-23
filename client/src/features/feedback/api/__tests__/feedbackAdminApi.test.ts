import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...p: string[]) => ({ path: p.join("/") })),
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  query: vi.fn((...a: unknown[]) => ({ q: a })),
  orderBy: vi.fn((f: string, d: string) => ({ orderBy: [f, d] })),
  limit: vi.fn((n: number) => ({ limit: n })),
}));

vi.mock("firebase/firestore", () => m);
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));

import { listFeedback, updateFeedbackStatus } from "../feedbackAdminApi";

describe("feedbackAdminApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("누락된 platform·status·email은 기본값으로 읽는다", async () => {
    m.getDocs.mockResolvedValue({
      docs: [{ id: "d1", data: () => ({ content: "a", createdAt: "2026-11-01T00:00:00.000Z", userId: "u" }) }],
    });
    const items = await listFeedback();
    expect(items).toEqual([
      { id: "d1", email: null, content: "a", createdAt: "2026-11-01T00:00:00.000Z", platform: "web", status: "new" },
    ]);
    expect(m.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(m.limit).toHaveBeenCalledWith(100);
  });

  it("있는 필드는 그대로 읽는다", async () => {
    m.getDocs.mockResolvedValue({
      docs: [{ id: "d2", data: () => ({ content: "b", createdAt: "x", email: "a@b.c", platform: "ios", status: "done" }) }],
    });
    const [item] = await listFeedback();
    expect(item).toMatchObject({ email: "a@b.c", platform: "ios", status: "done" });
  });

  it("updateFeedbackStatus는 status만 갱신한다", async () => {
    await updateFeedbackStatus("id1", "done");
    expect(m.updateDoc).toHaveBeenCalledWith({ path: "feedback/id1" }, { status: "done" });
  });
});
