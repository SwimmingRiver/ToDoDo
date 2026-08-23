import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { ReactNode } from "react";

jest.mock("../../firebase", () => ({ db: {} }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));
jest.mock("@tododo/core", () => ({
  updateTodo: jest.fn(() => Promise.resolve()),
}));

describe("useUpdateTodo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("캐시된 todos를 allTodos로 함께 넘겨서 updateTodo를 호출한다", async () => {
    const { updateTodo } = await import("@tododo/core");
    const { useUpdateTodo } = await import("../useUpdateTodo");

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false, gcTime: 0 },
      },
    });
    const cachedTodos = [
      { id: "root-1", parentId: null, status: "doing" },
      { id: "child-1", parentId: "root-1", status: "todo" },
    ];
    client.setQueryData(["todos", "u1"], cachedTodos);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = await renderHook(() => useUpdateTodo(), { wrapper });

    result.current.mutate({
      id: "root-1",
      fields: { status: "done", doneAt: "2026-08-23T00:00:00.000Z" },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(updateTodo).toHaveBeenCalledWith(
      {},
      "root-1",
      { status: "done", doneAt: "2026-08-23T00:00:00.000Z" },
      cachedTodos,
    );
  });

  it("캐시가 비어있으면 빈 배열을 allTodos로 넘긴다", async () => {
    const { updateTodo } = await import("@tododo/core");
    const { useUpdateTodo } = await import("../useUpdateTodo");

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false, gcTime: 0 },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = await renderHook(() => useUpdateTodo(), { wrapper });

    result.current.mutate({ id: "root-1", fields: { status: "doing" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(updateTodo).toHaveBeenCalledWith({}, "root-1", { status: "doing" }, []);
  });
});
