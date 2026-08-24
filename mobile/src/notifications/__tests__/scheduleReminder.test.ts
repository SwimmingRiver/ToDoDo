import { describe, it, expect, jest } from "@jest/globals";

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(() => Promise.resolve("notif-id")),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve(undefined)),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

describe("scheduleReminder", () => {
  it("dueAt이 미래인 할 일에 알림을 예약하고 id를 반환한다", async () => {
    const { scheduleNotificationAsync } = await import("expo-notifications");
    const { scheduleReminder } = await import("../scheduleReminder");

    const id = await scheduleReminder({
      id: "todo-1",
      title: "장보기",
      dueAt: "2099-01-01T09:00:00.000Z",
    });

    expect(id).toBe("notif-id");
    expect(scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ title: "장보기" }),
      }),
    );
  });

  it("dueAt이 없으면 예약하지 않고 null을 반환한다", async () => {
    const { scheduleReminder } = await import("../scheduleReminder");

    const id = await scheduleReminder({ id: "todo-1", title: "장보기", dueAt: null });

    expect(id).toBeNull();
  });

  it("cancelReminder는 저장된 알림 id를 취소한다", async () => {
    const { cancelScheduledNotificationAsync } = await import("expo-notifications");
    const { cancelReminder } = await import("../scheduleReminder");

    await cancelReminder("notif-id");

    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("notif-id");
  });
});
