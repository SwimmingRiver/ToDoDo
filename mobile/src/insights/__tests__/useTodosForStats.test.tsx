import { renderHook, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
let mockIsPremium = false;
let focusCallback: (() => void) | undefined;

jest.mock("@tododo/core", () => ({
  ...(jest.requireActual("@tododo/core") as object),
  fetchAllUserTodos: (...args: unknown[]) => mockFetch(...args),
}));
jest.mock("../../firebase", () => ({ db: {} }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "user-1" } }),
}));
jest.mock("../../premium", () => ({
  useIsPremium: () => ({ isPremium: mockIsPremium, isLoading: false }),
}));
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => {
    focusCallback = cb;
  },
}));

import { useTodosForStats } from "../useTodosForStats";

let queryClient: QueryClient;
const setup = () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTodosForStats(), { wrapper });
};

const focus = async () => {
  await act(async () => {
    focusCallback?.();
  });
};

describe("useTodosForStats", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 10, 22, 12) });
    mockFetch.mockReset();
    mockFetch.mockResolvedValue([]);
    mockIsPremium = false;
    focusCallback = undefined;
  });
  afterEach(() => {
    queryClient.clear();
    jest.useRealTimers();
  });

  it("무료면 조회하지 않는다", async () => {
    await setup();
    await act(async () => {});
    expect(mockFetch).toHaveBeenCalledTimes(0);
  });

  it("포커스 refetch는 무료면 안 한다", async () => {
    await setup();
    await focus();
    expect(mockFetch).toHaveBeenCalledTimes(0);
  });

  it("isPremium이 true가 되면 조회한다", async () => {
    const { rerender } = await setup();
    await act(async () => {});
    expect(mockFetch).toHaveBeenCalledTimes(0);
    mockIsPremium = true;
    await rerender({});
    await act(async () => {});
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("1분 이내 재포커스는 다시 읽지 않는다", async () => {
    mockIsPremium = true;
    await setup();
    await act(async () => {});
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await focus();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("1분 지나 재포커스하면 다시 읽는다", async () => {
    mockIsPremium = true;
    await setup();
    await act(async () => {});
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(61_000);
    });
    await focus();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("첫 조회 실패 후 포커스하면 다시 읽는다", async () => {
    mockIsPremium = true;
    mockFetch.mockRejectedValueOnce(new Error("fail"));
    await setup();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await focus();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
