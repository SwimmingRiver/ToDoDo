import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/react", () => ({ captureException }));
// importOriginal로 실제 api 모듈을 불러오면 authorizedFetch → @/shared/lib/firebase의
// getAuth()까지 실행된다. CI에는 .env가 없어 auth/invalid-api-key로 던지므로 목으로 대체한다.
vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: null }, googleProvider: {} }));
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
