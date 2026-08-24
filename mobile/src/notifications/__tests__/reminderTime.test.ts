import { describe, it, expect } from "@jest/globals";
import { getReminderTrigger } from "../reminderTime";

describe("getReminderTrigger", () => {
  it("dueAt이 미래면 그 시각을 반환한다", () => {
    const dueAt = "2099-12-31T09:00:00.000Z";
    const now = new Date("2026-08-20T00:00:00.000Z");

    expect(getReminderTrigger(dueAt, now)).toEqual(new Date(dueAt));
  });

  it("dueAt이 null이면 null을 반환한다 (예약 안 함)", () => {
    expect(getReminderTrigger(null, new Date())).toBeNull();
  });

  it("dueAt이 이미 지났으면 null을 반환한다 (과거 알림 예약 방지)", () => {
    const dueAt = "2026-01-01T00:00:00.000Z";
    const now = new Date("2026-08-20T00:00:00.000Z");

    expect(getReminderTrigger(dueAt, now)).toBeNull();
  });
});
