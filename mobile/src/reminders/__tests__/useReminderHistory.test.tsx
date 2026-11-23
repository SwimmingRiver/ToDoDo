import { describe, it, expect, jest } from "@jest/globals";

jest.mock("../../firebase", () => ({ auth: {}, db: {} }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));

const item = (sentAt: number) => ({ todoId: "a", title: "t", offsetMinutes: 30 as const, dueAt: "x", sentAt });

describe("hasUnreadReminders", () => {
  it("hasUnreadReminders true when sentAt > lastSeenAt", async () => {
    const { hasUnreadReminders } = await import("../hooks/useReminderHistory");
    expect(hasUnreadReminders({ items: [item(5), item(20)], lastSeenAt: 10 })).toBe(true);
  });

  it("false when empty", async () => {
    const { hasUnreadReminders } = await import("../hooks/useReminderHistory");
    expect(hasUnreadReminders({ items: [], lastSeenAt: 0 })).toBe(false);
    expect(hasUnreadReminders(undefined)).toBe(false);
  });
});
