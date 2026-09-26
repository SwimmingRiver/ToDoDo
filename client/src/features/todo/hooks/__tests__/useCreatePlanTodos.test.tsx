import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/react", () => ({ captureException }));
vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "u" } }, googleProvider: {} }));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
vi.mock("../../api", () => ({ createPlanTodos: vi.fn() }));

import { createPlanTodos } from "../../api";
import { useCreatePlanTodos } from "../useCreatePlanTodos";

const submission = {
  parent: { title: "p", dueDate: null, priority: "medium" as const },
  children: [{ title: "c", dueDate: null, priority: "low" as const }],
};

describe("useCreatePlanTodos", () => {
  it("성공하면 todos 쿼리를 무효화한다", async () => {
    vi.mocked(createPlanTodos).mockResolvedValueOnce({ parentId: "p1", count: 2 });
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreatePlanTodos(), { wrapper });
    act(() => result.current.mutate(submission));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["todos"] });
  });

  it("실패하면 Sentry에 보고한다", async () => {
    const error = new Error("commit failed");
    vi.mocked(createPlanTodos).mockRejectedValueOnce(error);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        {children}
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useCreatePlanTodos(), { wrapper });
    act(() => result.current.mutate(submission));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(captureException).toHaveBeenCalledWith(error, { tags: { feature: "aiPlan" } });
  });
});
