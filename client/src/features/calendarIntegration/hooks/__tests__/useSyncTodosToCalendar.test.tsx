import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Todo } from "@/features/todo";
import { useSyncTodosToCalendar } from "../useSyncTodosToCalendar";

vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  writeBatch: vi.fn(),
}));
vi.mock("@/features/todo", () => ({
  useGetTodos: vi.fn(),
}));
vi.mock("../useCalendarIntegration", () => ({
  useCalendarIntegrationStatus: vi.fn(),
}));
vi.mock("../../api", () => ({
  syncTodosToCalendar: vi.fn(),
}));

const baseTodo = (overrides: Partial<Todo>): Todo => ({
  id: "todo-1",
  userId: "user-1",
  title: "제목",
  status: "todo",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  startAt: null,
  dueAt: "2026-09-01T00:00:00.000Z",
  doneAt: null,
  priority: "medium",
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  archived: false,
  ...overrides,
});

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("useSyncTodosToCalendar", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { writeBatch } = await import("firebase/firestore");
    vi.mocked(writeBatch).mockReturnValue({
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  it("연동 안 됐으면 아무것도 호출하지 않는다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    vi.mocked(useGetTodos).mockReturnValue({ data: [baseTodo({})] } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: false, status: "active" },
    } as never);

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(syncTodosToCalendar)).not.toHaveBeenCalled();
  });

  it("dueAt이 있는 대상 Todo를 upsert로 동기화한다 (로컬 날짜 키로 변환해서 보낸다)", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    // UTC 16:00 = KST(+9) 다음날 01:00. 여기서 KST 로컬 날짜로 정확히 변환되는지가
    // 이 테스트의 핵심이다 — dueAt을 그대로 슬라이싱하면(버그) "2026-08-31"이
    // 나오지만, 로컬 변환을 거치면 "2026-09-01"이어야 한다.
    vi.mocked(useGetTodos).mockReturnValue({
      data: [baseTodo({ dueAt: "2026-08-31T16:00:00.000Z" })],
    } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValue([
      { id: "todo-1", googleEventId: "event-1" },
    ]);

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledWith([
        { id: "todo-1", title: "제목", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
      ]);
    });
  });

  it("동기화 결과 중 실패한 항목은 스냅샷을 갱신하지 않아 다음 실행에서 재시도된다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");
    const { writeBatch } = await import("firebase/firestore");

    vi.mocked(useGetTodos).mockReturnValue({ data: [baseTodo({})] } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValue([
      { id: "todo-1", googleEventId: null, error: "이벤트 POST 실패 (todo todo-1): 500" },
    ]);

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalled();
    });

    // 실패한 항목이라 Firestore에 googleEventId를 쓰지 않는다(hasWrites가 안 켜짐).
    const batchInstance = vi.mocked(writeBatch).mock.results[0]?.value as {
      update: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
    };
    expect(batchInstance.update).not.toHaveBeenCalled();
  });

  it("archived된 Todo는 동기화 대상에서 제외한다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    vi.mocked(useGetTodos).mockReturnValue({
      data: [baseTodo({ archived: true })],
    } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(syncTodosToCalendar)).not.toHaveBeenCalled();
  });

  it("dueAt이 없는 Todo는 동기화 대상에서 제외한다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    vi.mocked(useGetTodos).mockReturnValue({
      data: [baseTodo({ dueAt: null })],
    } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(syncTodosToCalendar)).not.toHaveBeenCalled();
  });
});
