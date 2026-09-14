import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUpgradeInterest } from "../useUpgradeInterest";

vi.mock("@/features/feedback/hooks", () => ({ useSubmitFeedback: vi.fn() }));

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

describe("useUpgradeInterest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submitInterest를 호출하면 '[프리미엄 관심]' 접두사를 붙여 피드백을 제출하고 성공 토스트를 보여준다", async () => {
    const { useSubmitFeedback } = await import("@/features/feedback/hooks");
    const mutate = vi.fn((_content, options) => options?.onSuccess?.());
    vi.mocked(useSubmitFeedback).mockReturnValue({ mutate, isPending: false } as never);

    const { result } = renderHook(() => useUpgradeInterest("구글 캘린더 연동 기능"));
    result.current.submitInterest();

    expect(mutate).toHaveBeenCalledWith(
      "[프리미엄 관심] 구글 캘린더 연동 기능을 구독하고 싶어요",
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("제출이 실패하면 에러 토스트를 보여준다", async () => {
    const { useSubmitFeedback } = await import("@/features/feedback/hooks");
    const mutate = vi.fn((_content, options) => options?.onError?.());
    vi.mocked(useSubmitFeedback).mockReturnValue({ mutate, isPending: false } as never);

    const { result } = renderHook(() => useUpgradeInterest("완료 통계/인사이트 기능"));
    result.current.submitInterest();

    expect(toastErrorMock).toHaveBeenCalled();
  });

  it("이미 제출 중이면(isPending) 중복 제출하지 않는다", async () => {
    const { useSubmitFeedback } = await import("@/features/feedback/hooks");
    const mutate = vi.fn();
    vi.mocked(useSubmitFeedback).mockReturnValue({ mutate, isPending: true } as never);

    const { result } = renderHook(() => useUpgradeInterest("구글 캘린더 연동 기능"));
    result.current.submitInterest();

    expect(mutate).not.toHaveBeenCalled();
  });
});
