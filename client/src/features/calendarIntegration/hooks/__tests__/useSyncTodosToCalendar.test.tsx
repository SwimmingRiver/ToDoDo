import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Todo } from "@/features/todo";
import { useSyncTodosToCalendar } from "../useSyncTodosToCalendar";
import { CalendarRevokedError } from "../../api";

vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
  googleProvider: {},
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
  writeBatch: vi.fn(),
}));
vi.mock("@/features/todo", () => ({
  useGetTodos: vi.fn(),
}));
vi.mock("../useCalendarIntegration", () => ({
  useCalendarIntegrationStatus: vi.fn(),
}));
vi.mock("../../api", async () => {
  const actual = await vi.importActual("../../api");
  return { ...actual, syncTodosToCalendar: vi.fn() };
});

// toDateKeyFromISO와 동일한 로컬 게터 방식으로 기대값을 계산한다 — 테스트 실행
// 환경의 TZ(로컬 개발 환경은 Asia/Seoul 고정 — client/src/test/setup.ts, CI는
// 추가로 America/New_York에서도 한 번 더 돈다)와 무관하게 항상 올바른 기대값과
// 비교하기 위함이다. "2026-09-01" 같은 하드코딩된 문자열은 음수 오프셋
// 타임존(America/New_York)에서 값이 달라져 CI의 두 번째 실행에서 실패한다.
const toLocalDateKey = (iso: string): string => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

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

    // UTC 16:00 = KST(+9) 기준 다음날 01:00. dueAt을 그대로 슬라이싱하면(버그)
    // 항상 "2026-08-31"이 나오지만, 로컬 변환을 거치면 실행 환경의 로컬
    // 타임존에 맞는 날짜가 나와야 한다 — toLocalDateKey가 그 기대값을 실행
    // 환경 기준으로 직접 계산한다.
    const inputIso = "2026-08-31T16:00:00.000Z";
    vi.mocked(useGetTodos).mockReturnValue({
      data: [baseTodo({ dueAt: inputIso })],
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
        {
          id: "todo-1",
          title: "제목",
          dueAt: toLocalDateKey(inputIso),
          googleEventId: null,
          action: "upsert",
        },
      ]);
    });
  });

  it("동기화 결과 중 실패한 항목은 스냅샷을 갱신하지 않아 다음 실행에서 재시도된다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);

    const todo = baseTodo({});
    vi.mocked(useGetTodos).mockReturnValue({ data: [todo] } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValueOnce([
      { id: "todo-1", googleEventId: null, error: "이벤트 POST 실패 (todo todo-1): 500" },
    ]);

    const { rerender } = renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1));

    // 실패한 항목이라 Firestore에 googleEventId를 쓰지 않는다.
    const { writeBatch } = await import("firebase/firestore");
    const firstBatch = vi.mocked(writeBatch).mock.results[0]?.value as {
      update: ReturnType<typeof vi.fn>;
    };
    expect(firstBatch.update).not.toHaveBeenCalled();

    // 스냅샷이 갱신되지 않았으므로, updatedAt이 그대로인 같은 Todo로 다시
    // 렌더링해도(참조만 바뀜) 동일하게 재전송 대상이 되어야 한다 — 이게 이
    // 훅이 제공하는 재시도 계약이다.
    vi.mocked(syncTodosToCalendar).mockResolvedValueOnce([
      { id: "todo-1", googleEventId: "event-1" },
    ]);
    vi.mocked(useGetTodos).mockReturnValue({ data: [{ ...todo }] } as never);
    rerender();

    await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(syncTodosToCalendar)).toHaveBeenLastCalledWith([
      {
        id: "todo-1",
        title: "제목",
        dueAt: toLocalDateKey(todo.dueAt as string),
        googleEventId: null,
        action: "upsert",
      },
    ]);
  });

  it("변경 없는 Todo는 다시 렌더링돼도 재전송하지 않는다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    const todo = baseTodo({});
    vi.mocked(useGetTodos).mockReturnValue({ data: [todo] } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValue([{ id: "todo-1", googleEventId: "event-1" }]);

    const { rerender } = renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });
    await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1));

    // updatedAt이 동일한 내용으로 참조만 바꿔 다시 렌더링 — 재전송되면 안 된다.
    vi.mocked(useGetTodos).mockReturnValue({ data: [{ ...todo }] } as never);
    rerender();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1);
  });

  it("대상에서 빠진 Todo는 매핑된 이벤트를 삭제 요청하고, 문서가 남아있으면 googleEventId도 지운다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");
    const { writeBatch } = await import("firebase/firestore");

    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);

    const todo = baseTodo({ googleEventId: "event-1" });
    vi.mocked(useGetTodos).mockReturnValue({ data: [todo] } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValueOnce([
      { id: "todo-1", googleEventId: "event-1" },
    ]);

    const updateSpy = vi.fn();
    vi.mocked(writeBatch).mockReturnValue({
      update: updateSpy,
      commit: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { rerender } = renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });
    await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1));

    // dueAt을 지워 대상에서만 빠지게 한다(문서 자체는 그대로 남아있음).
    const stillExistingTodo = { ...todo, dueAt: null, updatedAt: "2026-08-02T00:00:00.000Z" };
    vi.mocked(useGetTodos).mockReturnValue({ data: [stillExistingTodo] } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValueOnce([{ id: "todo-1", googleEventId: null }]);
    rerender();

    await waitFor(() => {
      expect(vi.mocked(syncTodosToCalendar)).toHaveBeenLastCalledWith([
        { id: "todo-1", title: "", dueAt: "", googleEventId: "event-1", action: "delete" },
      ]);
    });
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(expect.anything(), { googleEventId: null });
    });
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

  it("동기화 도중 CalendarRevokedError가 나면 연동 상태를 revoked로 기록한다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");
    const { setDoc } = await import("firebase/firestore");

    vi.mocked(useGetTodos).mockReturnValue({ data: [baseTodo({})] } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(syncTodosToCalendar).mockRejectedValue(new CalendarRevokedError());

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(vi.mocked(setDoc)).toHaveBeenCalledWith(
        expect.anything(),
        { status: "revoked" },
        { merge: true },
      );
    });
  });
});
