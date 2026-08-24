import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { ReactNode } from "react";

jest.mock("../../firebase", () => ({ db: {} }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));
jest.mock("@tododo/core", () => ({
  updateTodo: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../notifications/scheduleReminder", () => ({
  scheduleReminder: jest.fn(() => Promise.resolve("notif-id")),
}));

// queries.gcTime는 기본값(5분)을 유지한다 — 0으로 두면 setQueryData로 채운
// 캐시가 활성 옵저버(useQuery) 없이 즉시 가비지 컬렉트되어, mutate() 시점에
// getQueryData가 undefined를 반환하는 레이스가 생긴다(mutations.gcTime은
// mutate 자체와 무관해 0으로 둬도 안전). 대신 테스트가 끝나면 client.clear()로
// 그 5분 타이머를 직접 취소해, jest 프로세스가 타이머 때문에 안 끝나는 걸 막는다.
const testClients: QueryClient[] = [];
const createTestClient = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  testClients.push(client);
  return client;
};

describe("useUpdateTodo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    testClients.forEach((client) => client.clear());
    testClients.length = 0;
  });

  it("캐시된 todos를 allTodos로 함께 넘겨서 updateTodo를 호출한다", async () => {
    const { updateTodo } = await import("@tododo/core");
    const { useUpdateTodo } = await import("../useUpdateTodo");

    const client = createTestClient();
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

  it("캐시에 빈 배열이 저장되어 있으면(할 일 0개인 정상 상태) 그대로 진행한다", async () => {
    const { updateTodo } = await import("@tododo/core");
    const { useUpdateTodo } = await import("../useUpdateTodo");

    const client = createTestClient();
    client.setQueryData(["todos", "u1"], []);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = await renderHook(() => useUpdateTodo(), { wrapper });

    result.current.mutate({ id: "root-1", fields: { status: "doing" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(updateTodo).toHaveBeenCalledWith({}, "root-1", { status: "doing" }, []);
  });

  it("todos 캐시가 아예 준비되지 않았으면(undefined) 조용히 넘어가지 않고 에러를 던진다", async () => {
    const { updateTodo } = await import("@tododo/core");
    const { useUpdateTodo } = await import("../useUpdateTodo");

    const client = createTestClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = await renderHook(() => useUpdateTodo(), { wrapper });

    result.current.mutate({ id: "root-1", fields: { status: "doing" } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(updateTodo).not.toHaveBeenCalled();
  });

  it("dueAt이 바뀌고 title이 주어지면 알림을 재예약한다", async () => {
    const { scheduleReminder } = await import("../../notifications/scheduleReminder");
    const { useUpdateTodo } = await import("../useUpdateTodo");

    const client = createTestClient();
    client.setQueryData(["todos", "u1"], []);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = await renderHook(() => useUpdateTodo(), { wrapper });

    result.current.mutate({
      id: "root-1",
      fields: { dueAt: "2099-01-01T09:00:00.000Z" },
      title: "장보기",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(scheduleReminder).toHaveBeenCalledWith({
      id: "root-1",
      title: "장보기",
      dueAt: "2099-01-01T09:00:00.000Z",
    });
  });

  it("status가 done이면 알림을 재예약하지 않는다", async () => {
    const { scheduleReminder } = await import("../../notifications/scheduleReminder");
    const { useUpdateTodo } = await import("../useUpdateTodo");

    const client = createTestClient();
    client.setQueryData(["todos", "u1"], []);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = await renderHook(() => useUpdateTodo(), { wrapper });

    result.current.mutate({
      id: "root-1",
      fields: { status: "done", doneAt: "2026-08-23T00:00:00.000Z" },
      title: "장보기",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(scheduleReminder).not.toHaveBeenCalled();
  });

  it("title이 주어지지 않으면 알림을 재예약하지 않는다", async () => {
    const { scheduleReminder } = await import("../../notifications/scheduleReminder");
    const { useUpdateTodo } = await import("../useUpdateTodo");

    const client = createTestClient();
    client.setQueryData(["todos", "u1"], []);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = await renderHook(() => useUpdateTodo(), { wrapper });

    result.current.mutate({ id: "root-1", fields: { status: "doing" } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(scheduleReminder).not.toHaveBeenCalled();
  });
});
