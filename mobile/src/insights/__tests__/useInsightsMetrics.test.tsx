import { renderHook, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

jest.mock("@tododo/core", () => ({
  ...(jest.requireActual("@tododo/core") as object),
  fetchAllUserTodos: (...args: unknown[]) => mockFetch(...args),
}));
jest.mock("../../firebase", () => ({ db: {} }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "user-1" } }),
}));
jest.mock("../../premium", () => ({
  useIsPremium: () => ({ isPremium: true, isLoading: false }),
}));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: () => {},
}));

import { useInsightsMetrics } from "../useInsightsMetrics";

let queryClient: QueryClient;

describe("useInsightsMetrics", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 10, 22, 23, 50) });
    mockFetch.mockReset();
    mockFetch.mockImplementation(async () => [{ id: "t1", title: "a", status: "todo", parentId: null }]);
  });
  afterEach(() => {
    queryClient.clear();
    jest.useRealTimers();
  });

  it("새로 읽으면 now를 다시 잡는다", async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const filter = { period: "last90Days" as const, projectId: null };
    const { result } = await renderHook(() => useInsightsMetrics(filter), { wrapper });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(result.current.hasData).toBe(true);
    const firstStart = result.current.trend[0].key;

    // 자정을 넘긴 뒤 같은 데이터를 다시 읽는다.
    jest.setSystemTime(new Date(2026, 10, 23, 0, 10));
    await act(async () => {
      await result.current.refetch();
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(result.current.trend[0].key).not.toBe(firstStart);
  });
});
