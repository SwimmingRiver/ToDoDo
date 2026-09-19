import { describe, it, expect } from "vitest";
import { deriveGoogleCalendarEventId } from "../googleEventId";

describe("deriveGoogleCalendarEventId", () => {
  it("같은 todoId에 대해 항상 같은 id를 반환한다(결정론성)", async () => {
    const first = await deriveGoogleCalendarEventId("todo-abc");
    const second = await deriveGoogleCalendarEventId("todo-abc");
    expect(first).toBe(second);
  });

  it("다른 todoId는 다른 id를 반환한다", async () => {
    const a = await deriveGoogleCalendarEventId("todo-a");
    const b = await deriveGoogleCalendarEventId("todo-b");
    expect(a).not.toBe(b);
  });

  it.each([
    "todo-1",
    "aB3-xyz_9",
    "한글아이디",
    "",
    "a".repeat(200),
  ])("Google Calendar id 문자셋(base32hex)과 길이 제약을 만족한다: %s", async (todoId) => {
    const id = await deriveGoogleCalendarEventId(todoId);
    expect(id).toMatch(/^[0-9a-v]+$/);
    expect(id.length).toBeGreaterThanOrEqual(5);
    expect(id.length).toBeLessThanOrEqual(1024);
  });
});
