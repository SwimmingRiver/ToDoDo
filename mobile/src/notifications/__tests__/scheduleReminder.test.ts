import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { PermissionStatus } from "expo-notifications";

jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(() => Promise.resolve("notif-id")),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve(undefined)),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

const permissionResponse = (status: "granted" | "undetermined" | "denied") => ({
  status: status as PermissionStatus,
  granted: status === "granted",
  canAskAgain: status !== "denied",
  expires: "never" as const,
});

describe("scheduleReminder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("dueAt이 미래인 할 일에 알림을 예약하고 id를 반환한다", async () => {
    const { scheduleNotificationAsync, getPermissionsAsync } = await import("expo-notifications");
    jest.mocked(getPermissionsAsync).mockResolvedValueOnce(permissionResponse("granted"));
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

  it("권한이 이미 허용되어 있으면 재요청 없이 예약한다", async () => {
    const { getPermissionsAsync, requestPermissionsAsync } = await import("expo-notifications");
    jest.mocked(getPermissionsAsync).mockResolvedValueOnce(permissionResponse("granted"));
    const { scheduleReminder } = await import("../scheduleReminder");

    const id = await scheduleReminder({
      id: "todo-1",
      title: "장보기",
      dueAt: "2099-01-01T09:00:00.000Z",
    });

    expect(id).toBe("notif-id");
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("권한이 없으면 요청하고, 허용되면 예약한다", async () => {
    const { getPermissionsAsync, requestPermissionsAsync } = await import("expo-notifications");
    jest.mocked(getPermissionsAsync).mockResolvedValueOnce(permissionResponse("undetermined"));
    jest.mocked(requestPermissionsAsync).mockResolvedValueOnce(permissionResponse("granted"));
    const { scheduleReminder } = await import("../scheduleReminder");

    const id = await scheduleReminder({
      id: "todo-1",
      title: "장보기",
      dueAt: "2099-01-01T09:00:00.000Z",
    });

    expect(requestPermissionsAsync).toHaveBeenCalled();
    expect(id).toBe("notif-id");
  });

  it("권한 요청이 거부되면 예약하지 않고 null을 반환한다", async () => {
    const { getPermissionsAsync, requestPermissionsAsync, scheduleNotificationAsync } =
      await import("expo-notifications");
    jest.mocked(getPermissionsAsync).mockResolvedValueOnce(permissionResponse("undetermined"));
    jest.mocked(requestPermissionsAsync).mockResolvedValueOnce(permissionResponse("denied"));
    const { scheduleReminder } = await import("../scheduleReminder");

    const id = await scheduleReminder({
      id: "todo-1",
      title: "장보기",
      dueAt: "2099-01-01T09:00:00.000Z",
    });

    expect(id).toBeNull();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
