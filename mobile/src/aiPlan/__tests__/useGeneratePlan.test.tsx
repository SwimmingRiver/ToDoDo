import { act, renderHook } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { ReactNode } from "react";
import { AiPlanError } from "@tododo/core/dist/aiPlan/index.js";

const mockRequestPlan = jest.fn<(input: unknown) => Promise<unknown>>();
jest.mock("../aiProxyApi", () => ({ requestPlan: (input: unknown) => mockRequestPlan(input) }));

const sentryMock = jest.requireMock("@sentry/react-native") as { captureException: jest.Mock };

const run = async () => {
  const { useGeneratePlan } = await import("../useGeneratePlan");
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useGeneratePlan(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({} as never).catch(() => {});
  });
};

describe("useGeneratePlan 오류 보고", () => {
  let warn: ReturnType<typeof jest.spyOn>;
  beforeEach(() => {
    sentryMock.captureException.mockClear();
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("예상하지 못한 실패(UNKNOWN)는 aiPlan 태그로 보고한다", async () => {
    mockRequestPlan.mockRejectedValue(new AiPlanError("UNKNOWN", 0));
    await run();
    expect(sentryMock.captureException).toHaveBeenCalledWith(expect.any(AiPlanError), { tags: { feature: "aiPlan" } });
  });

  it("예상된 실패(무료 잠금·하루 한도)는 보고하지 않는다", async () => {
    mockRequestPlan.mockRejectedValueOnce(new AiPlanError("PREMIUM_REQUIRED", 403));
    await run();
    mockRequestPlan.mockRejectedValueOnce(new AiPlanError("DAILY_LIMIT", 429));
    await run();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });
});
