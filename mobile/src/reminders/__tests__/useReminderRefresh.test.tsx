import { renderHook, act } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { AppState, type AppStateStatus } from "react-native";

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

  describe("앱이 백그라운드로 갈 때 대기 중인 갱신을 바로 보낸다", () => {
    type Listener = (state: AppStateStatus) => void;
    let listeners: Listener[];
    let removes: AnyMock[];
    const emit = async (state: AppStateStatus) => {
      await act(async () => { listeners.forEach((l) => l(state)); });
    };

    beforeEach(() => {
      // clearAllMocks는 구현을 되돌리지 않으므로, 테스트별 mockImplementation이 새지 않게 기본값으로 되돌린다.
      const { requestReminderRefresh } = jest.requireMock("../api/reminderProxyApi") as { requestReminderRefresh: AnyMock };
      requestReminderRefresh.mockImplementation(() => Promise.resolve());
      listeners = [];
      removes = [];
      jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, l: Listener) => {
        listeners.push(l);
        const remove = jest.fn();
        removes.push(remove);
        return { remove };
      }) as never);
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it.each(["background", "inactive"] as const)("%s: 2초를 기다리지 않고 즉시 1회 보내고, 이후 타이머로 다시 보내지 않는다", async (state) => {
      const { requestReminderRefresh } = jest.requireMock("../api/reminderProxyApi") as { requestReminderRefresh: AnyMock };
      const { useReminderRefresh } = await import("../hooks/useReminderRefresh");
      await renderHook(() => useReminderRefresh());
      await act(async () => { jest.advanceTimersByTime(500); });
      expect(requestReminderRefresh).not.toHaveBeenCalled();

      await emit(state);
      expect(requestReminderRefresh).toHaveBeenCalledTimes(1);

      await act(async () => { jest.advanceTimersByTime(5000); });
      await emit("active");
      await emit("background");
      expect(requestReminderRefresh).toHaveBeenCalledTimes(1);
    });

    it("대기 중인 갱신이 없으면 백그라운드 전환에도 보내지 않는다", async () => {
      const { requestReminderRefresh } = jest.requireMock("../api/reminderProxyApi") as { requestReminderRefresh: AnyMock };
      const { useReminderRefresh } = await import("../hooks/useReminderRefresh");
      await renderHook(() => useReminderRefresh());
      await act(async () => { jest.advanceTimersByTime(2000); });
      expect(requestReminderRefresh).toHaveBeenCalledTimes(1);
      await emit("background");
      expect(requestReminderRefresh).toHaveBeenCalledTimes(1);
    });

    it("active 전환은 보내지 않는다", async () => {
      const { requestReminderRefresh } = jest.requireMock("../api/reminderProxyApi") as { requestReminderRefresh: AnyMock };
      const { useReminderRefresh } = await import("../hooks/useReminderRefresh");
      await renderHook(() => useReminderRefresh());
      await emit("active");
      expect(requestReminderRefresh).not.toHaveBeenCalled();
    });

    it("보내는 중(응답 전) 같은 내용으로 다시 백그라운드가 와도 중복 전송하지 않는다", async () => {
      const { requestReminderRefresh } = jest.requireMock("../api/reminderProxyApi") as { requestReminderRefresh: AnyMock };
      requestReminderRefresh.mockImplementation(() => new Promise(() => {}));
      const { useReminderRefresh } = await import("../hooks/useReminderRefresh");
      await renderHook(() => useReminderRefresh());
      await emit("inactive");
      await emit("background");
      expect(requestReminderRefresh).toHaveBeenCalledTimes(1);
    });

    it("전송 실패 후 대기 중인 상태로 남지 않아, 다음 내용 변경 때 다시 보낸다", async () => {
      const { requestReminderRefresh } = jest.requireMock("../api/reminderProxyApi") as { requestReminderRefresh: AnyMock };
      const { reportError } = jest.requireMock("../../shared/lib/sentry") as { reportError: AnyMock };
      requestReminderRefresh.mockImplementationOnce(() => Promise.reject(new Error("503")));
      const { useReminderRefresh } = await import("../hooks/useReminderRefresh");
      const { rerender } = await renderHook(() => useReminderRefresh());
      await emit("background");
      expect(reportError).toHaveBeenCalledTimes(1);
      mockTodos = [todo({ dueAt: "2030-01-03T10:00:00.000Z" })];
      await rerender({});
      await emit("background");
      expect(requestReminderRefresh).toHaveBeenCalledTimes(2);
    });

    it("언마운트하면 타이머와 AppState 구독을 정리하고 보내지 않는다(로그아웃 경로)", async () => {
      const { requestReminderRefresh } = jest.requireMock("../api/reminderProxyApi") as { requestReminderRefresh: AnyMock };
      const { useReminderRefresh } = await import("../hooks/useReminderRefresh");
      const { unmount } = await renderHook(() => useReminderRefresh());
      await act(async () => { unmount(); });
      expect(removes).toHaveLength(1);
      expect(removes[0]).toHaveBeenCalledTimes(1);
      await act(async () => { jest.advanceTimersByTime(5000); });
      expect(requestReminderRefresh).not.toHaveBeenCalled();
    });
  });
});
