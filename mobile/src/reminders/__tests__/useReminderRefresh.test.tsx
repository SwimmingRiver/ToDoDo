import { renderHook, act } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

let mockTodos: unknown[] | undefined;
jest.mock("../../hooks/useTodos", () => ({ useTodos: () => ({ data: mockTodos }) }));
jest.mock("../../shared/lib/sentry", () => ({ reportError: jest.fn() }));
jest.mock("../api/reminderProxyApi", () => ({
  requestReminderRefresh: jest.fn(() => Promise.resolve()),
}));

const todo = (over: Record<string, unknown> = {}) => ({
  id: "a",
  title: "t",
  status: "todo",
  dueAt: "2030-01-01T10:00:00.000Z",
  reminderOffsetMinutes: null,
  ...over,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.Mock<(...args: any[]) => any>;

describe("useReminderRefresh", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockTodos = [todo()];
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("sends once after 2s debounce when fingerprint changes", async () => {
    const { requestReminderRefresh } = jest.requireMock("../api/reminderProxyApi") as { requestReminderRefresh: AnyMock };
    const { useReminderRefresh } = await import("../hooks/useReminderRefresh");
    const { rerender } = await renderHook(() => useReminderRefresh());
    await act(async () => { jest.advanceTimersByTime(1999); });
    expect(requestReminderRefresh).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(requestReminderRefresh).toHaveBeenCalledTimes(1);
    mockTodos = [todo({ dueAt: "2030-01-02T10:00:00.000Z" })];
    await rerender({});
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(requestReminderRefresh).toHaveBeenCalledTimes(2);
  });

  it("no resend when unrelated field (title) changes", async () => {
    const { requestReminderRefresh } = jest.requireMock("../api/reminderProxyApi") as { requestReminderRefresh: AnyMock };
    const { useReminderRefresh } = await import("../hooks/useReminderRefresh");
    const { rerender } = await renderHook(() => useReminderRefresh());
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(requestReminderRefresh).toHaveBeenCalledTimes(1);
    mockTodos = [todo({ title: "changed" })];
    await rerender({});
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(requestReminderRefresh).toHaveBeenCalledTimes(1);
  });

  it("sends regardless of permission", async () => {
    const { requestReminderRefresh } = jest.requireMock("../api/reminderProxyApi") as { requestReminderRefresh: AnyMock };
    const { hasPermission } = jest.requireMock("@react-native-firebase/messaging") as { hasPermission: AnyMock };
    hasPermission.mockResolvedValue(0);
    const { useReminderRefresh } = await import("../hooks/useReminderRefresh");
    await renderHook(() => useReminderRefresh());
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(requestReminderRefresh).toHaveBeenCalledTimes(1);
  });
});
