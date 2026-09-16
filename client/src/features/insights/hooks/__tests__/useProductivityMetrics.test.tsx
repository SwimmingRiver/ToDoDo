import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProductivityMetrics } from "../useProductivityMetrics";

vi.mock("../useTodosForStats", () => ({ useTodosForStats: vi.fn() }));

describe("useProductivityMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("로딩 중이면 isLoading이 true이고 빈 목록 기준 기본 지표를 반환한다", async () => {
    const { useTodosForStats } = await import("../useTodosForStats");
    vi.mocked(useTodosForStats).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);

    const { result } = renderHook(() => useProductivityMetrics());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.completionRateAll).toEqual({ completed: 0, total: 0, rate: 0 });
    expect(result.current.streak).toBe(0);
  });

  it("todos가 있으면 각 계산 유틸의 결과를 종합해서 반환한다", async () => {
    const { useTodosForStats } = await import("../useTodosForStats");
    const todos = [
      {
        id: "1",
        status: "done",
        priority: "high",
        dueAt: null,
        doneAt: new Date().toISOString(),
        recurrence: null,
      },
    ];
    vi.mocked(useTodosForStats).mockReturnValue({
      data: todos,
      isLoading: false,
      isError: false,
    } as never);

    const { result } = renderHook(() => useProductivityMetrics());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.completionRateAll).toEqual({ completed: 1, total: 1, rate: 1 });
    expect(result.current.streak).toBe(1);
    expect(result.current.priorityDistribution).toEqual({ low: 0, medium: 0, high: 1 });
    expect(result.current.trend).toHaveLength(14);
  });
});
