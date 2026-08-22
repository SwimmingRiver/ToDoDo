import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, jest } from "@jest/globals";
import type { ReactNode } from "react";

jest.mock("../../firebase", () => ({ db: {} }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));
jest.mock("@tododo/core", () => ({
  getTodos: jest.fn(() =>
    Promise.resolve([{ id: "todo-1", title: "테스트" }])
  ),
}));

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("useTodos", () => {
  it("로그인 사용자의 할 일 목록을 반환한다", async () => {
    const { useTodos } = await import("../useTodos");
    const { result } = await renderHook(() => useTodos(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "todo-1", title: "테스트" }]);
  });
});
