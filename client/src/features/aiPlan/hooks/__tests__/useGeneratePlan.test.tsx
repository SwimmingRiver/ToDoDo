import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/react", () => ({ captureException }));
vi.mock("../../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api")>()),
  requestPlan: vi.fn(),
}));

import { requestPlan, AiPlanError } from "../../api";
import { useGeneratePlan } from "../useGeneratePlan";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const input = { goal: "g", dueDate: null, today: "2026-09-25" };

describe("useGeneratePlan", () => {
  beforeEach(() => {
    captureException.mockClear();
    vi.mocked(requestPlan).mockReset();
  });

  it("예상된 실패(한도)는 Sentry에 보내지 않는다", async () => {
    vi.mocked(requestPlan).mockRejectedValueOnce(new AiPlanError("DAILY_LIMIT", 429));
    const { result } = renderHook(() => useGeneratePlan(), { wrapper });
    act(() => result.current.mutate(input));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("예상 밖 실패(503·네트워크)는 feature 태그로 보고한다", async () => {
    const error = new AiPlanError("AI_UNAVAILABLE", 503);
    vi.mocked(requestPlan).mockRejectedValueOnce(error);
    const { result } = renderHook(() => useGeneratePlan(), { wrapper });
    act(() => result.current.mutate(input));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(captureException).toHaveBeenCalledWith(error, { tags: { feature: "aiPlan" } });
  });
});
