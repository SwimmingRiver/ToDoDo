import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InsightsPage from "../insightsPage";

vi.mock("../../hooks", () => ({ useProductivityMetrics: vi.fn() }));
vi.mock("@/features/feedback/hooks", () => ({ useSubmitFeedback: vi.fn() }));
vi.mock("@/features/entitlement", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/entitlement")>();
  return { ...actual, useIsPremium: vi.fn() };
});

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));
vi.mock("@/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared")>();
  return {
    ...actual,
    useToast: () => ({ error: toastErrorMock, success: toastSuccessMock }),
  };
});

const baseMetrics = {
  completionRate7d: { completed: 1, total: 2, rate: 0.5 },
  completionRate30d: { completed: 1, total: 2, rate: 0.5 },
  completionRateAll: { completed: 1, total: 2, rate: 0.5 },
  streak: 1,
  priorityDistribution: { low: 0, medium: 1, high: 0 },
  recurringVsOneOff: {
    recurring: { completed: 0, total: 0, rate: 0 },
    oneOff: { completed: 1, total: 2, rate: 0.5 },
  },
  dueAdherence: { completed: 1, total: 1, rate: 1 },
  trend: [{ date: "2026-09-14", count: 1 }],
  isLoading: false,
  isError: false,
};

describe("InsightsPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useIsPremium } = await import("@/features/entitlement");
    const { useProductivityMetrics } = await import("../../hooks");
    const { useSubmitFeedback } = await import("@/features/feedback/hooks");
    vi.mocked(useIsPremium).mockReturnValue({ isPremium: true, isLoading: false });
    vi.mocked(useProductivityMetrics).mockReturnValue(baseMetrics as never);
    vi.mocked(useSubmitFeedback).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  });

  it("프리미엄이면 통계 콘텐츠를 렌더링한다", () => {
    render(<InsightsPage />);

    expect(screen.getByText("1일")).toBeInTheDocument(); // StreakCard
    expect(screen.getByText("최근 7일 완료율")).toBeInTheDocument();
    expect(screen.getByText("완료한 할 일의 우선순위 분포")).toBeInTheDocument();
    expect(screen.getByText(/완료 추이/)).toBeInTheDocument();
    expect(screen.queryByText("완료 통계는 프리미엄 기능입니다")).not.toBeInTheDocument();
  });

  it("프리미엄이 아니면 잠금 안내만 보여주고 통계 콘텐츠는 렌더링하지 않는다", async () => {
    const { useIsPremium } = await import("@/features/entitlement");
    vi.mocked(useIsPremium).mockReturnValue({ isPremium: false, isLoading: false });

    render(<InsightsPage />);

    expect(screen.getByText("완료 통계는 프리미엄 기능입니다")).toBeInTheDocument();
    expect(screen.queryByText("최근 7일 완료율")).not.toBeInTheDocument();
  });

  it("잠금 안내의 '관심 있어요'를 클릭하면 피드백을 제출한다", async () => {
    const { useIsPremium } = await import("@/features/entitlement");
    const { useSubmitFeedback } = await import("@/features/feedback/hooks");
    const mutate = vi.fn((_content, options) => options?.onSuccess?.());
    vi.mocked(useIsPremium).mockReturnValue({ isPremium: false, isLoading: false });
    vi.mocked(useSubmitFeedback).mockReturnValue({ mutate, isPending: false } as never);

    render(<InsightsPage />);
    fireEvent.click(screen.getByText("관심 있어요"));

    expect(mutate).toHaveBeenCalledWith(
      expect.stringContaining("완료 통계"),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("통계 조회가 실패하면(isError) 0%로 조용히 넘어가지 않고 에러 상태를 보여준다", async () => {
    const { useProductivityMetrics } = await import("../../hooks");
    vi.mocked(useProductivityMetrics).mockReturnValue({
      ...baseMetrics,
      isError: true,
    } as never);

    render(<InsightsPage />);

    expect(screen.getByText("통계를 불러오지 못했습니다")).toBeInTheDocument();
    expect(screen.queryByText("최근 7일 완료율")).not.toBeInTheDocument();
  });

  it("엔타이틀먼트 로딩 중이면 스켈레톤을 보여준다", async () => {
    const { useIsPremium } = await import("@/features/entitlement");
    vi.mocked(useIsPremium).mockReturnValue({ isPremium: false, isLoading: true });

    const { container } = render(<InsightsPage />);

    expect(container.querySelector("[aria-hidden='true']")).toBeInTheDocument();
  });
});
