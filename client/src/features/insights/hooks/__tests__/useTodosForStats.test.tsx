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

let queryClient: QueryClient;
const createWrapper = () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
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

  // 할 일을 바꾸는 웹 동작은 모두 ["todos"]를 무효화한다. 통계도 그 키 아래에 둬서
  // 따로 배선하지 않아도 할 일이 바뀌면 바로 다시 읽게 한다.
  it("할 일 캐시(['todos'])를 무효화하면 통계도 다시 읽는다", async () => {
    const { getAllTodosForStats } = await import("../../api");
    vi.mocked(getAllTodosForStats).mockResolvedValue([]);

    const { result } = renderHook(() => useTodosForStats(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAllTodosForStats).toHaveBeenCalledTimes(1);

    await queryClient.invalidateQueries({ queryKey: ["todos"] });

    await waitFor(() => expect(getAllTodosForStats).toHaveBeenCalledTimes(2));
  });

  it("다른 기기 변경을 반영하도록, 60초가 지난 뒤 화면에 다시 들어오면 다시 읽는다", async () => {
    const { getAllTodosForStats } = await import("../../api");
    vi.mocked(getAllTodosForStats).mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    try {
      const first = renderHook(() => useTodosForStats(), { wrapper });
      await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
      first.unmount();

      // 59초 뒤 재진입: 아직 신선 → 다시 읽지 않음
      now.mockReturnValue(start + 59_000);
      const second = renderHook(() => useTodosForStats(), { wrapper });
      await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
      expect(getAllTodosForStats).toHaveBeenCalledTimes(1);
      second.unmount();

      // 61초 뒤 재진입: 오래됨 → 다시 읽음
      now.mockReturnValue(start + 61_000);
      renderHook(() => useTodosForStats(), { wrapper });
      await waitFor(() => expect(getAllTodosForStats).toHaveBeenCalledTimes(2));
    } finally {
      now.mockRestore();
    }
  });
});
