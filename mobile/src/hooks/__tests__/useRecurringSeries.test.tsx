import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, jest } from "@jest/globals";
import type { ReactNode } from "react";

jest.mock("../../firebase", () => ({ db: {} }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));
jest.mock("@tododo/core", () => ({
  createRecurringTodo: jest.fn(() => Promise.resolve([{ id: "r1" }])),
  editRecurringSeries: jest.fn(() => Promise.resolve()),
  deleteRecurringSeries: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../notifications/scheduleReminder", () => ({
  scheduleReminder: jest.fn(() => Promise.resolve(null)),
}));

const setup = () => {
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
  return { invalidateSpy, wrapper };
};

const input = {
  title: "운동",
  priority: "medium",
  startAt: "2099-01-01T00:00:00.000Z",
  dueAt: null,
  parentId: null,
  order: 0,
  recurrenceRule: { frequency: "daily", interval: 1 },
} as never;

describe("반복 시리즈 훅", () => {
  it("useCreateRecurringTodo: core 호출 + 무효화 + 알림 미예약", async () => {
    const { createRecurringTodo } = await import("@tododo/core");
    const { scheduleReminder } = await import("../../notifications/scheduleReminder");
    const { useCreateRecurringTodo } = await import("../useCreateRecurringTodo");
    const { invalidateSpy, wrapper } = setup();
    const { result } = await renderHook(() => useCreateRecurringTodo(), { wrapper });
    result.current.mutate(input);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createRecurringTodo).toHaveBeenCalledWith({}, "u1", input);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["todos", "u1"] });
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it("useEditRecurringSeries: core 호출 + 무효화", async () => {
    const { editRecurringSeries } = await import("@tododo/core");
    const { useEditRecurringSeries } = await import("../useEditRecurringSeries");
    const { invalidateSpy, wrapper } = setup();
    const { result } = await renderHook(() => useEditRecurringSeries(), { wrapper });
    const edit = { ...(input as object), id: "t1" } as never;
    result.current.mutate(edit);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(editRecurringSeries).toHaveBeenCalledWith({}, "u1", edit);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["todos", "u1"] });
  });

  it("useDeleteRecurringSeries: core 호출 + 무효화", async () => {
    const { deleteRecurringSeries } = await import("@tododo/core");
    const { useDeleteRecurringSeries } = await import("../useDeleteRecurringSeries");
    const { invalidateSpy, wrapper } = setup();
    const { result } = await renderHook(() => useDeleteRecurringSeries(), { wrapper });
    result.current.mutate("rec-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteRecurringSeries).toHaveBeenCalledWith({}, "u1", "rec-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["todos", "u1"] });
  });
});
