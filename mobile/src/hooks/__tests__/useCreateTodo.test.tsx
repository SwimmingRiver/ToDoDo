import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, jest } from "@jest/globals";
import type { ReactNode } from "react";

jest.mock("../../firebase", () => ({ db: {} }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));
jest.mock("@tododo/core", () => ({
  createTodo: jest.fn(() => Promise.resolve("new-id")),
}));

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("useCreateTodo", () => {
  it("생성 성공 시 todos 쿼리를 무효화한다", async () => {
    const { createTodo } = await import("@tododo/core");
    const { useCreateTodo } = await import("../useCreateTodo");
    const { result } = await renderHook(() => useCreateTodo(), { wrapper });

    result.current.mutate({
      title: "새 할 일",
      priority: "medium",
      startAt: null,
      dueAt: null,
      parentId: null,
      order: 0,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createTodo).toHaveBeenCalledWith({}, "u1", expect.objectContaining({ title: "새 할 일" }));
  });
});
