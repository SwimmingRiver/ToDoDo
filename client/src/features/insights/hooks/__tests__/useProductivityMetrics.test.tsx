import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { DEFAULT_INSIGHTS_FILTER } from "@tododo/core";
import { useProductivityMetrics } from "../useProductivityMetrics";

vi.mock("../useTodosForStats", () => ({ useTodosForStats: vi.fn() }));

describe("useProductivityMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 절대 날짜 대신 시스템 시간을 고정한다 — thisMonth 범위·트렌드 버킷 개수가
    // 실행 시점(오늘)에 따라 흔들리지 않게 하기 위함(client/CLAUDE.md 컨벤션).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("로딩 중이면 isLoading이 true이고 빈 목록 기준 기본 지표를 반환한다", async () => {
    const { useTodosForStats } = await import("../useTodosForStats");
    vi.mocked(useTodosForStats).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);

    const { result } = renderHook(() => useProductivityMetrics(DEFAULT_INSIGHTS_FILTER));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.completionRate).toEqual({ completed: 0, total: 0, rate: 0 });
    expect(result.current.streak).toBe(0);
    expect(result.current.projects).toEqual([]);
  });

  it("todos가 있으면 core 계산 함수들의 결과를 필터 기준으로 종합해서 반환한다", async () => {
    const { useTodosForStats } = await import("../useTodosForStats");
    const todos = [
      {
        id: "1",
        userId: "user-1",
        title: "완료된 할 일",
        status: "done",
        priority: "high",
        startAt: null,
        dueAt: null,
        doneAt: new Date().toISOString(),
        parentId: null,
        order: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recurrence: null,
      },
    ];
    vi.mocked(useTodosForStats).mockReturnValue({
      data: todos,
      isLoading: false,
      isError: false,
    } as never);

    const { result } = renderHook(() => useProductivityMetrics(DEFAULT_INSIGHTS_FILTER));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.completionRate).toEqual({ completed: 1, total: 1, rate: 1 });
    expect(result.current.streak).toBe(1);
    expect(result.current.priorityDistribution).toEqual({ low: 0, medium: 0, high: 1 });
    expect(result.current.statusBreakdown).toBeNull(); // projectId: null이라 계산하지 않는다
    expect(result.current.projects).toEqual([{ id: "1", title: "완료된 할 일", isDone: true }]);
    expect(result.current.trend.length).toBeGreaterThan(0);
  });
});
