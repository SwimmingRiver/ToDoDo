import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Todo } from "@/features/todo";
import { useSyncTodosToCalendar } from "../useSyncTodosToCalendar";
import { CalendarRevokedError, CalendarNotConnectedError } from "../../api";
import * as Sentry from "@sentry/react";

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

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
    localStorage.clear();
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

    // 동기화 후 Firestore 갱신으로 googleEventId가 채워진 채, updatedAt이 동일한
    // 내용으로 참조만 바꿔 다시 렌더링 — 재전송되면 안 된다.
    vi.mocked(useGetTodos).mockReturnValue({
      data: [{ ...todo, googleEventId: "event-1" }],
    } as never);
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

  it("스냅샷이 localStorage에 저장되어 새로고침(새 훅 마운트) 후에도 대상에서 빠진 Todo를 정리한다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");

    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);

    const todo = baseTodo({ googleEventId: "event-1" });
    vi.mocked(useGetTodos).mockReturnValue({ data: [todo] } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValueOnce([
      { id: "todo-1", googleEventId: "event-1" },
    ]);

    const { unmount } = renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });
    await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1));
    unmount();

    // 새 훅 인스턴스(=새 페이지 로드를 흉내) — Todo가 아카이브/삭제돼 대상에서
    // 완전히 사라졌다. localStorage에 저장된 스냅샷이 없다면 이 훅은 이 Todo가
    // 있었다는 사실 자체를 몰라 정리 요청을 보낼 수 없다.
    vi.mocked(useGetTodos).mockReturnValue({ data: [] } as never);
    vi.mocked(syncTodosToCalendar).mockResolvedValueOnce([{ id: "todo-1", googleEventId: null }]);

    renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(vi.mocked(syncTodosToCalendar)).toHaveBeenLastCalledWith([
        { id: "todo-1", title: "", dueAt: "", googleEventId: "event-1", action: "delete" },
      ]);
    });
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

  // 다른 탭에서 해제한 뒤 이 탭의 연동 캐시(staleTime 60초)가 아직 connected:true면
  // Todo 수정 한 번에 전체 upsert가 나가고 Worker가 409 not_connected를 준다.
  // 이건 오류가 아니라 "연동 상태가 바뀌었다"는 신호다 — Sentry 대신 연동 상태를
  // 다시 읽어 훅이 스스로 멈추게 한다.
  it("동기화가 CalendarNotConnectedError로 실패하면 Sentry에 보고하지 않고 연동 상태 쿼리를 무효화한다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");
    vi.mocked(Sentry.captureException).mockClear();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(useGetTodos).mockReturnValue({ data: [baseTodo({})] } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(syncTodosToCalendar).mockRejectedValue(new CalendarNotConnectedError());

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(() => useSyncTodosToCalendar(), { wrapper: Wrapper });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["calendarIntegration", "user-1"] }),
    );
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  // 해제가 Worker 단계(토큰 삭제)까지 끝나고 Firestore 단계에서 실패하면 Firestore는
  // connected:true, Worker는 토큰 없음인 어긋난 상태가 된다. 재조회해도 같은 값이라
  // 이펙트가 안 돌고 동기화만 조용히 멈추므로, Worker를 진실로 보고 Firestore를 맞춘다.
  it("409 뒤 재조회해도 여전히 connected:true면 Firestore를 connected:false로 맞춘다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { syncTodosToCalendar } = await import("../../api");
    const { setDoc } = await import("firebase/firestore");
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.mocked(useGetTodos).mockReturnValue({ data: [baseTodo({})] } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(syncTodosToCalendar).mockRejectedValue(new CalendarNotConnectedError());

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // 옵저버가 없어 invalidate가 재조회를 일으키지 않는다 = "재조회해도 그대로"를 흉내
    queryClient.setQueryData(["calendarIntegration", "user-1"], { connected: true, status: "active" });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(() => useSyncTodosToCalendar(), { wrapper: Wrapper });

    await waitFor(() =>
      expect(vi.mocked(setDoc)).toHaveBeenCalledWith(
        expect.anything(),
        { connected: false, status: "active" },
        { merge: true },
      ),
    );
    consoleWarn.mockRestore();
  });

  // 어떤 경로로 해제되든(버튼, 타탭, 409) 이미 삭제된 구글 이벤트가 화면에 유령처럼
  // 남지 않도록 연동 해제 상태를 보면 이벤트 캐시를 지운다.
  it("연동 해제 상태를 보면 googleCalendarEvents 캐시를 지운다", async () => {
    const { useGetTodos } = await import("@/features/todo");
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    vi.mocked(useGetTodos).mockReturnValue({ data: [] } as never);
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: false, status: "active" },
    } as never);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["googleCalendarEvents", "a", "b"], [{ id: "g-1" }]);
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(() => useSyncTodosToCalendar(), { wrapper: Wrapper });

    await waitFor(() =>
      expect(queryClient.getQueryData(["googleCalendarEvents", "a", "b"])).toBeUndefined(),
    );
  });

  // 연동 해제는 구글 이벤트를 지우고 Firestore googleEventId만 null로 만들 뿐
  // updatedAt은 안 바꾼다. 스냅샷이 그대로 남아 있으면 재연결 후 기존 Todo가
  // "변경 없음"으로 걸러져 영원히 다시 올라가지 않는다(사용자 보고: 재연결 후
  // 새 Todo만 동기화됨).
  describe("연동 해제 → 재연결", () => {
    it("해제 후 재연결하면 이전에 동기화됐던 기존 Todo를 다시 upsert한다", async () => {
      const { useGetTodos } = await import("@/features/todo");
      const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
      const { syncTodosToCalendar } = await import("../../api");

      const todo = baseTodo({});
      vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
        data: { connected: true, status: "active" },
      } as never);
      vi.mocked(useGetTodos).mockReturnValue({ data: [todo] } as never);
      vi.mocked(syncTodosToCalendar).mockResolvedValue([{ id: "todo-1", googleEventId: "event-1" }]);

      const { rerender } = renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });
      await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1));

      // 연동 해제: 구글 이벤트 삭제됨, Firestore googleEventId null, updatedAt 그대로
      vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
        data: { connected: false, status: "active" },
      } as never);
      vi.mocked(useGetTodos).mockReturnValue({ data: [{ ...todo, googleEventId: null }] } as never);
      rerender();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1);

      // 재연결
      vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
        data: { connected: true, status: "active" },
      } as never);
      rerender();

      await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(2));
      expect(vi.mocked(syncTodosToCalendar)).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: "todo-1", action: "upsert" }),
      ]);
    });

    it("스냅샷의 updatedAt이 같아도 Firestore에 googleEventId가 없으면 다시 upsert한다 (다른 기기에서 해제한 경우)", async () => {
      const { useGetTodos } = await import("@/features/todo");
      const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
      const { syncTodosToCalendar } = await import("../../api");

      const todo = baseTodo({ googleEventId: null });
      // 이 기기의 localStorage 스냅샷은 여전히 "동기화 완료"라고 믿고 있다.
      localStorage.setItem(
        "calendarSyncSnapshot:user-1",
        JSON.stringify([["todo-1", { updatedAt: todo.updatedAt, googleEventId: "event-1" }]]),
      );
      vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
        data: { connected: true, status: "active" },
      } as never);
      vi.mocked(useGetTodos).mockReturnValue({ data: [todo] } as never);
      vi.mocked(syncTodosToCalendar).mockResolvedValue([{ id: "todo-1", googleEventId: "event-1" }]);

      renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

      await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1));
      // 스냅샷의 옛 id("event-1")는 지워진 이벤트의 tombstone을 가리킨다 — 그 id로
      // PATCH하면 구글이 200을 주면서도 cancelled 그대로라 영영 안 보인다. null을
      // 보내 Worker의 결정론적 POST→409→되살리기 경로를 타게 해야 한다.
      expect(vi.mocked(syncTodosToCalendar)).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: "todo-1", action: "upsert", googleEventId: null }),
      ]);
    });

    // 진행 중인 동기화가 끝나면서 클로저에 잡힌 옛 스냅샷을 localStorage에 되돌려
    // 쓰면 해제 시점의 clear가 무효가 되고, 재연결(OAuth 전체 새로고침) 후
    // loadSnapshot이 stale id를 그대로 복원한다.
    it("동기화 진행 중에 해제되면, 끝난 동기화가 옛 스냅샷을 localStorage에 되돌려 쓰지 않는다", async () => {
      const { useGetTodos } = await import("@/features/todo");
      const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
      const { syncTodosToCalendar } = await import("../../api");

      let resolveSync!: (v: { id: string; googleEventId: string }[]) => void;
      vi.mocked(syncTodosToCalendar).mockReturnValue(
        new Promise((resolve) => {
          resolveSync = resolve;
        }),
      );
      vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
        data: { connected: true, status: "active" },
      } as never);
      vi.mocked(useGetTodos).mockReturnValue({ data: [baseTodo({})] } as never);

      const { rerender } = renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });
      await waitFor(() => expect(vi.mocked(syncTodosToCalendar)).toHaveBeenCalledTimes(1));

      // 동기화가 아직 안 끝난 상태에서 연동 해제
      vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
        data: { connected: false, status: "active" },
      } as never);
      rerender();
      await waitFor(() => expect(localStorage.getItem("calendarSyncSnapshot:user-1")).toBeNull());

      resolveSync([{ id: "todo-1", googleEventId: "event-1" }]);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(localStorage.getItem("calendarSyncSnapshot:user-1")).toBeNull();
    });

    it("연동 해제 상태를 보면 localStorage 스냅샷을 비운다", async () => {
      const { useGetTodos } = await import("@/features/todo");
      const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");

      localStorage.setItem(
        "calendarSyncSnapshot:user-1",
        JSON.stringify([["todo-1", { updatedAt: "2026-08-01T00:00:00.000Z", googleEventId: "event-1" }]]),
      );
      vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
        data: { connected: false, status: "active" },
      } as never);
      vi.mocked(useGetTodos).mockReturnValue({ data: [] } as never);

      renderHook(() => useSyncTodosToCalendar(), { wrapper: createWrapper() });

      await waitFor(() => expect(localStorage.getItem("calendarSyncSnapshot:user-1")).toBeNull());
    });
  });
});
