import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Todo } from "@/features/todo/types";

const { refreshMock, todosState } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  todosState: { data: undefined as Todo[] | undefined },
}));
vi.mock("../../api/reminderProxyApi", () => ({ requestReminderRefresh: refreshMock }));
vi.mock("@/features/todo/hooks", () => ({ useGetTodos: () => todosState }));
vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

import { buildReminderFingerprint, REFRESH_DEBOUNCE_MS, useReminderRefresh } from "../useReminderRefresh";

const todo = (o: Partial<Todo> = {}): Todo =>
  ({
    id: "t1",
    title: "보고서",
    status: "todo",
    dueAt: "2026-10-01T09:00:00.000Z",
    archived: false,
    ...o,
  }) as Todo;

beforeEach(() => {
  vi.useFakeTimers();
  refreshMock.mockReset().mockResolvedValue(undefined);
  todosState.data = undefined;
});
afterEach(() => vi.useRealTimers());

describe("buildReminderFingerprint", () => {
  it("마감 없는 할 일과 제목은 무시한다", () => {
    const a = buildReminderFingerprint([todo(), todo({ id: "t2", dueAt: null })]);
    const b = buildReminderFingerprint([todo({ title: "다른 제목" })]);
    expect(a).toBe(b);
  });

  it("dueAt·status·archived·reminderOffsetMinutes가 바뀌면 달라진다", () => {
    const base = buildReminderFingerprint([todo()]);
    for (const change of [
      { dueAt: "2026-10-02T09:00:00.000Z" },
      { status: "done" as const },
      { archived: true },
      { reminderOffsetMinutes: 60 as const },
    ]) {
      expect(buildReminderFingerprint([todo(change)])).not.toBe(base);
    }
  });

  it("순서와 무관하다", () => {
    const x = todo({ id: "a" });
    const y = todo({ id: "b" });
    expect(buildReminderFingerprint([x, y])).toBe(buildReminderFingerprint([y, x]));
  });
});

describe("useReminderRefresh", () => {
  it("todos가 로드되기 전엔 보내지 않는다", () => {
    renderHook(() => useReminderRefresh());
    act(() => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("첫 로드 때 디바운스 후 1회 보낸다(마감 있는 할 일이 없어도)", async () => {
    todosState.data = [];
    renderHook(() => useReminderRefresh());
    act(() => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS - 1));
    expect(refreshMock).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("연속 변경은 한 번으로 모으고, 제목만 바뀌면 보내지 않는다", async () => {
    todosState.data = [todo()];
    const { rerender } = renderHook(() => useReminderRefresh());
    await act(async () => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(refreshMock).toHaveBeenCalledTimes(1);

    todosState.data = [todo({ title: "제목만" })];
    rerender();
    await act(async () => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(refreshMock).toHaveBeenCalledTimes(1);

    todosState.data = [todo({ dueAt: "2026-10-02T09:00:00.000Z" })];
    rerender();
    act(() => vi.advanceTimersByTime(1000));
    todosState.data = [todo({ dueAt: "2026-10-03T09:00:00.000Z" })];
    rerender();
    await act(async () => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });

  it("실패하면 같은 상태라도 다음 렌더에서 다시 보낸다", async () => {
    refreshMock.mockRejectedValueOnce(new Error("503"));
    todosState.data = [todo()];
    const { rerender } = renderHook(() => useReminderRefresh());
    await act(async () => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    todosState.data = [todo()]; // 새 배열 참조, 같은 지문
    rerender();
    await act(async () => vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS));
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });
});
