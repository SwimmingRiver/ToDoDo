import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, jest } from "@jest/globals";
import type { ReactNode } from "react";

jest.mock("../../firebase", () => ({ db: {} }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "uid-1" }, loading: false }),
}));
jest.mock("@tododo/core", () => ({
  createPlanTodos: jest.fn(() => Promise.resolve({ parentId: "p1", count: 3 })),
}));
jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(),
}));

describe("useCreatePlanTodos", () => {
  it("저장하고 todos를 무효화하며 알림은 예약하지 않는다", async () => {
    const { createPlanTodos } = await import("@tododo/core");
    const Notifications = await import("expo-notifications");
    const { useCreatePlanTodos } = await import("../useCreatePlanTodos");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
    });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(() => useCreatePlanTodos(), { wrapper });
    const submission = { parent: {}, children: [] } as never;

    result.current.mutate(submission);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createPlanTodos).toHaveBeenCalledWith({}, "uid-1", submission);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["todos", "uid-1"] });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
