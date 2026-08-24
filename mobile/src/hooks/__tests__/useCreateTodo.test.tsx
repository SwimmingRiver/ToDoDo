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
jest.mock("../../notifications/scheduleReminder", () => ({
  scheduleReminder: jest.fn(() => Promise.resolve(null)),
}));

describe("useCreateTodo", () => {
  it("생성 성공 시 todos 쿼리를 무효화한다", async () => {
    const { createTodo } = await import("@tododo/core");
    const { useCreateTodo } = await import("../useCreateTodo");

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false, gcTime: 0 },
      },
    });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

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
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["todos", "u1"] });
  });

  it("생성 성공 시 새로 만든 id로 알림을 예약한다", async () => {
    const { scheduleReminder } = await import("../../notifications/scheduleReminder");
    const { useCreateTodo } = await import("../useCreateTodo");

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false, gcTime: 0 },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = await renderHook(() => useCreateTodo(), { wrapper });

    result.current.mutate({
      title: "장보기",
      priority: "medium",
      startAt: null,
      dueAt: "2099-01-01T09:00:00.000Z",
      parentId: null,
      order: 0,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(scheduleReminder).toHaveBeenCalledWith({
      id: "new-id",
      title: "장보기",
      dueAt: "2099-01-01T09:00:00.000Z",
    });
  });
});
