import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEntitlement } from "../useEntitlement";
import { useIsPremium } from "../useIsPremium";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "../../types";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
  googleProvider: {},
}));
vi.mock("../../api", () => ({
  getEntitlement: vi.fn(),
  entitlementQueryKey: (uid: string | undefined) => ["entitlement", uid] as const,
}));

const NOW = new Date("2026-10-10T00:00:00.000Z");

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const entitlement = (overrides: Partial<Entitlement>): Entitlement => ({ ...DEFAULT_ENTITLEMENT, ...overrides });

describe("useEntitlement", () => {
  it("getEntitlement 결과를 그대로 반환한다", async () => {
    const { getEntitlement } = await import("../../api");
    vi.mocked(getEntitlement).mockResolvedValue(entitlement({ plan: "premium" }));
    const { result } = renderHook(() => useEntitlement(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.plan).toBe("premium");
  });
});

describe("useIsPremium", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const render = async (value: Entitlement) => {
    const { getEntitlement } = await import("../../api");
    vi.mocked(getEntitlement).mockResolvedValue(value);
    const hook = renderHook(() => useIsPremium(), { wrapper: createWrapper() });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    return hook;
  };

  it("premiumUntil이 미래면 true(status와 무관)", async () => {
    const { result } = await render(entitlement({ status: "past_due", premiumUntil: "2026-10-11T00:00:00.000Z" }));
    expect(result.current.isPremium).toBe(true);
  });

  it("premiumUntil이 지났으면 false(status가 active여도)", async () => {
    const { result } = await render(entitlement({ status: "active", plan: "premium", premiumUntil: "2026-10-09T00:00:00.000Z" }));
    expect(result.current.isPremium).toBe(false);
  });

  it("premiumUntil이 없으면 false", async () => {
    const { result } = await render(entitlement({ plan: "premium", status: "active" }));
    expect(result.current.isPremium).toBe(false);
  });

  it("열려 있는 동안 만료 시각이 지나면 스스로 잠긴다", async () => {
    const { result } = await render(entitlement({ premiumUntil: "2026-10-10T00:00:30.000Z" }));
    expect(result.current.isPremium).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(result.current.isPremium).toBe(false);
  });
});
