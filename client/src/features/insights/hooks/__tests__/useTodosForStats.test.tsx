import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTodosForStats } from "../useTodosForStats";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
  googleProvider: {},
}));
vi.mock("../../api", () => ({ getAllTodosForStats: vi.fn() }));
vi.mock("@/features/entitlement", () => ({ useIsPremium: vi.fn() }));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("useTodosForStats", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useIsPremium } = await import("@/features/entitlement");
    vi.mocked(useIsPremium).mockReturnValue({ isPremium: true, isLoading: false });
  });

  it("getAllTodosForStats 결과를 그대로 반환한다", async () => {
    const { getAllTodosForStats } = await import("../../api");
    vi.mocked(getAllTodosForStats).mockResolvedValue([
      { id: "1", status: "done" } as never,
    ]);

    const { result } = renderHook(() => useTodosForStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "1", status: "done" }]);
  });

  it("프리미엄이 아니면 쿼리가 비활성화되어 Firestore를 조회하지 않는다", async () => {
    const { useIsPremium } = await import("@/features/entitlement");
    const { getAllTodosForStats } = await import("../../api");
    vi.mocked(useIsPremium).mockReturnValue({ isPremium: false, isLoading: false });

    const { result } = renderHook(() => useTodosForStats(), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(getAllTodosForStats).not.toHaveBeenCalled();
  });
});
