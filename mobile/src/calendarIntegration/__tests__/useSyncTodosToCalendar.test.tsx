import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ReactNode } from "react";
import type { Todo } from "@tododo/core";
import type { SyncSnapshot } from "@tododo/core/dist/calendarSync/index.js";

const mockAuth: { currentUser: { uid: string } | null } = { currentUser: { uid: "uid-1" } };
jest.mock("../../firebase", () => ({ db: { __db: true }, get auth() { return mockAuth; } }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: mockAuth.currentUser, loading: false }),
}));
let mockIsPremium = true;
jest.mock("../../premium", () => ({ useIsPremium: () => ({ isPremium: mockIsPremium, isLoading: false }) }));
let mockTodos: Todo[] | undefined;
jest.mock("../../hooks/useTodos", () => ({ useTodos: () => ({ data: mockTodos }) }));

const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn<() => Promise<void>>();
jest.mock("firebase/firestore", () => ({
  doc: jest.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  writeBatch: jest.fn(() => ({ update: mockBatchUpdate, commit: mockBatchCommit })),
}));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock("../calendarProxyApi", () => {
  const core = jest.requireActual("@tododo/core/dist/calendarSync/index.js") as Record<string, unknown>;
  return {
    syncTodosToCalendar: jest.fn(),
    getOAuthStartUrl: jest.fn(),
    disconnectCalendar: jest.fn(),
    CalendarRevokedError: core.CalendarRevokedError,
    CalendarNotConnectedError: core.CalendarNotConnectedError,
  };
});
jest.mock("../snapshotStorage", () => ({
  loadSnapshot: jest.fn(),
  saveSnapshot: jest.fn(),
  clearSnapshot: jest.fn(),
}));
jest.mock("../markCalendarRevoked", () => ({ markCalendarRevoked: jest.fn() }));

import { getDoc, setDoc } from "firebase/firestore";
import { CalendarNotConnectedError, CalendarRevokedError } from "@tododo/core/dist/calendarSync/index.js";
import { syncTodosToCalendar } from "../calendarProxyApi";
import { clearSnapshot, loadSnapshot, saveSnapshot } from "../snapshotStorage";
import { markCalendarRevoked } from "../markCalendarRevoked";
import { useSyncTodosToCalendar } from "../useSyncTodosToCalendar";

const sentryMock = jest.requireMock("@sentry/react-native") as { captureException: jest.Mock };

const mockGetDoc = jest.mocked(getDoc);
const mockSetDoc = jest.mocked(setDoc);
const mockSync = jest.mocked(syncTodosToCalendar);
const mockLoad = jest.mocked(loadSnapshot);
const mockSave = jest.mocked(saveSnapshot);
const mockClear = jest.mocked(clearSnapshot);
const mockRevoked = jest.mocked(markCalendarRevoked);

const makeTodo = (over: Partial<Todo> = {}): Todo => ({
  id: "t1",
  userId: "uid-1",
  title: "할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: "2026-11-21T03:00:00.000Z",
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
  ...over,
});

const integrationDoc = (data: { connected: boolean; status?: string }) =>
  ({ exists: () => true, data: () => data }) as never;

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
const wrap = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.currentUser = { uid: "uid-1" };
  mockIsPremium = true;
  mockTodos = [makeTodo()];
  mockGetDoc.mockResolvedValue(integrationDoc({ connected: true, status: "active" }));
  mockSetDoc.mockResolvedValue(undefined);
  mockBatchCommit.mockResolvedValue(undefined);
  mockLoad.mockResolvedValue(new Map());
  mockSave.mockResolvedValue(undefined);
  mockClear.mockResolvedValue(undefined);
  mockRevoked.mockResolvedValue(undefined);
  // clearAllMocks는 mockResolvedValueOnce 큐를 안 비운다 — 앞 테스트의 남은 값이 새지 않게 한다.
  mockSync.mockReset();
  mockSync.mockResolvedValue([{ id: "t1", googleEventId: "evt-1" }]);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("useSyncTodosToCalendar", () => {
  it("세션 중 프리미엄이 만료되면 캐시된 connected:true가 남아 있어도 동기화 요청을 보내지 않는다", async () => {
    const client = makeClient();
    // 상태 쿼리는 isPremium=false로 꺼지지만, 프리미엄일 때 받은 connected:true가 캐시에 남는다.
    client.setQueryData(["calendarIntegration", "uid-1"], { connected: true, status: "active" });
    mockIsPremium = false;
    await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(client) });
    await waitFor(() => expect(mockLoad).toHaveBeenCalled());
    await flush();
    await flush();
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("스냅샷 로드가 끝나기 전에는 동기화하지 않고, 끝나면 한 번 동기화한다", async () => {
    let resolveLoad: (s: SyncSnapshot) => void = () => {};
    mockLoad.mockReturnValue(new Promise<SyncSnapshot>((r) => (resolveLoad = r)));
    await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
    await waitFor(() => expect(mockGetDoc).toHaveBeenCalled());
    await flush();
    expect(mockSync).not.toHaveBeenCalled();

    await act(async () => resolveLoad(new Map()));
    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
    expect(mockLoad).toHaveBeenCalledWith("uid-1");
    expect(mockSync.mock.calls[0][0]).toEqual([
      { id: "t1", title: "할 일", dueAt: "2026-11-21", googleEventId: null, action: "upsert" },
    ]);
  });

  it("결과의 googleEventId를 Firestore batch.update로 기록하고 스냅샷을 저장한다", async () => {
    await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
    await waitFor(() => expect(mockBatchCommit).toHaveBeenCalled());
    expect(mockBatchUpdate).toHaveBeenCalledWith({ path: "todos/t1" }, { googleEventId: "evt-1" });
    expect(mockSave).toHaveBeenCalledTimes(1);
    const [uid, saved] = mockSave.mock.calls[0];
    expect(uid).toBe("uid-1");
    expect((saved as SyncSnapshot).get("t1")).toEqual({
      updatedAt: "2026-11-20T00:00:00.000Z",
      googleEventId: "evt-1",
    });
  });

  it("스냅샷에 있던 할 일이 todos에서 사라지면 delete를 보낸다", async () => {
    mockTodos = [];
    mockLoad.mockResolvedValue(new Map([["gone", { updatedAt: "x", googleEventId: "evt-gone" }]]));
    mockSync.mockResolvedValue([{ id: "gone", googleEventId: null }]);
    await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
    expect(mockSync.mock.calls[0][0]).toEqual([
      { id: "gone", title: "", dueAt: "", googleEventId: "evt-gone", action: "delete" },
    ]);
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    // 문서가 없으므로 Firestore 업데이트는 없다.
    expect(mockBatchUpdate).not.toHaveBeenCalled();
    expect((mockSave.mock.calls[0][1] as SyncSnapshot).has("gone")).toBe(false);
  });

  it("미연동이면 스냅샷·이벤트 캐시를 지우고 요청하지 않는다", async () => {
    mockGetDoc.mockResolvedValue(integrationDoc({ connected: false, status: "active" }));
    const client = makeClient();
    const removeSpy = jest.spyOn(client, "removeQueries");
    await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(client) });
    await waitFor(() => expect(mockClear).toHaveBeenCalledWith("uid-1"));
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ["googleCalendarEvents"] });
    await flush();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("CalendarRevokedError면 markCalendarRevoked를 호출한다", async () => {
    mockSync.mockRejectedValue(new CalendarRevokedError());
    await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
    await waitFor(() => expect(mockRevoked).toHaveBeenCalledTimes(1));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("CalendarNotConnectedError면 상태를 다시 읽고 여전히 connected면 connected:false를 기록한다", async () => {
    mockSync.mockRejectedValue(new CalendarNotConnectedError());
    await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    // 최초 조회 + 409 후 재조회
    expect(mockGetDoc.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: "calendarIntegrations/uid-1" },
      { connected: false, status: "active" },
      { merge: true },
    );
  });

  it("CalendarNotConnectedError 후 재조회가 이미 미연동이면 기록하지 않는다", async () => {
    mockSync.mockRejectedValue(new CalendarNotConnectedError());
    mockGetDoc
      .mockResolvedValueOnce(integrationDoc({ connected: true, status: "active" }))
      .mockResolvedValue(integrationDoc({ connected: false, status: "active" }));
    await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
    await waitFor(() => expect(mockClear).toHaveBeenCalledWith("uid-1"));
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("무료 사용자는 요청하지 않는다", async () => {
    mockIsPremium = false;
    await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
    await flush();
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("진행 중에 todos가 바뀌면 끝난 뒤 한 번 다시 동기화한다", async () => {
    let resolveFirst: (v: { id: string; googleEventId: string | null }[]) => void = () => {};
    mockSync.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)));
    const { rerender } = await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));

    mockTodos = [makeTodo(), makeTodo({ id: "t2", title: "둘" })];
    await rerender({});
    await flush();
    expect(mockSync).toHaveBeenCalledTimes(1);

    mockSync.mockResolvedValue([{ id: "t2", googleEventId: "evt-2" }]);
    await act(async () => resolveFirst([{ id: "t1", googleEventId: "evt-1" }]));
    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(2));
    // t1은 첫 실행 결과로 스냅샷에 들어갔지만 mockTodos의 googleEventId가 아직 null이라 다시 포함된다.
    expect(mockSync.mock.calls[1][0].map((p) => p.id)).toContain("t2");
  });

  it("동기화 도중 연동이 해제되면 옛 스냅샷을 되돌려 저장하지 않는다(Firestore 기록은 한다)", async () => {
    let resolveSync: (v: { id: string; googleEventId: string | null }[]) => void = () => {};
    mockSync.mockReturnValueOnce(new Promise((r) => (resolveSync = r)));
    const client = makeClient();
    await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(client) });
    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));

    mockGetDoc.mockResolvedValue(integrationDoc({ connected: false, status: "active" }));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["calendarIntegration", "uid-1"] });
    });
    await waitFor(() => expect(mockClear).toHaveBeenCalledWith("uid-1"));

    await act(async () => resolveSync([{ id: "t1", googleEventId: "evt-1" }]));
    await waitFor(() => expect(mockBatchCommit).toHaveBeenCalled());
    expect(mockSave).not.toHaveBeenCalled();
  });

  // 11-21 레이트 리밋 폭주: 실패 항목이 스냅샷에 안 들어가 todos 재조회마다 즉시 재전송됐다
  // (할 일 하나가 최대 7번). 쿨다운(5분) 동안 같은 updatedAt이면 다시 보내지 않는다.
  describe("실패 항목 쿨다운", () => {
    const NOW = 1_800_000_000_000;
    let nowSpy: jest.SpiedFunction<typeof Date.now>;
    beforeEach(() => {
      nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW);
    });
    afterEach(() => {
      nowSpy.mockRestore();
    });

    const renderWithFailure = async () => {
      mockSync.mockResolvedValueOnce([{ id: "t1", googleEventId: null, error: "403 rateLimitExceeded" }]);
      const hook = await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
      await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
      await flush();
      return hook;
    };

    it("실패한 항목은 쿨다운 동안 todos가 다시 와도(updatedAt 그대로) 재전송하지 않는다", async () => {
      const { rerender } = await renderWithFailure();
      nowSpy.mockReturnValue(NOW + 60_000);
      mockTodos = [makeTodo()];
      await rerender({});
      await flush();
      expect(mockSync).toHaveBeenCalledTimes(1);
    });

    it("실패 뒤 수정되면(updatedAt 변경) 쿨다운 중이어도 바로 다시 보낸다", async () => {
      const { rerender } = await renderWithFailure();
      nowSpy.mockReturnValue(NOW + 1000);
      mockTodos = [makeTodo({ title: "수정됨", updatedAt: "2026-11-21T00:00:00.000Z" })];
      await rerender({});
      await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(2));
      expect(mockSync.mock.calls[1][0]).toEqual([expect.objectContaining({ id: "t1", title: "수정됨" })]);
    });

    it("쿨다운이 지나면 같은 항목을 다시 보낸다", async () => {
      const { rerender } = await renderWithFailure();
      nowSpy.mockReturnValue(NOW + 5 * 60_000);
      mockTodos = [makeTodo()];
      await rerender({});
      await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(2));
    });

    it("요청 자체가 실패해도 그 묶음은 쿨다운에 걸어 즉시 재전송하지 않는다", async () => {
      sentryMock.captureException.mockClear();
      mockSync.mockRejectedValueOnce(new Error("동기화 실패: 500"));
      const { rerender } = await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
      await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
      await flush();
      expect(sentryMock.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { feature: "calendar" } });
      mockTodos = [makeTodo()];
      await rerender({});
      await flush();
      expect(mockSync).toHaveBeenCalledTimes(1);
    });
  });

  // 리뷰 I-1: 묶음마다 todos를 무효화하면 루프 도중 재조회된 todos(뒤 묶음은 아직
  // googleEventId null)로 끝난 뒤 재실행이 돌아 뒤 묶음을 다시 upsert했다.
  it("묶음 전송 중 todos가 재조회돼도 같은 항목을 두 번 보내지 않는다", async () => {
    const base = Array.from({ length: 23 }, (_, i) => makeTodo({ id: `t${i}` }));
    mockTodos = base;
    const synced = new Set<string>();
    mockSync.mockImplementation(async (batch) => {
      await new Promise((r) => setTimeout(r, 1));
      batch.forEach((p) => synced.add(p.id));
      return batch.map((p) => ({ id: p.id, googleEventId: `evt-${p.id}` }));
    });
    const client = makeClient();
    const original = client.invalidateQueries.bind(client);
    let rerenderHook: () => void = () => {};
    jest.spyOn(client, "invalidateQueries").mockImplementation(async (filters) => {
      const key = (filters as { queryKey?: unknown[] } | undefined)?.queryKey;
      if (key?.[0] !== "todos") return original(filters);
      // 재조회 흉내(getDocs라 비동기): 조회 시점까지 Firestore에 쓰인 값으로 조금 뒤에 온다.
      const snapshotOfSynced = new Set(synced);
      await new Promise((r) => setTimeout(r, 5));
      mockTodos = base.map((t) => (snapshotOfSynced.has(t.id) ? { ...t, googleEventId: `evt-${t.id}` } : t));
      rerenderHook();
    });
    const { rerender } = await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(client) });
    rerenderHook = () => void rerender({});

    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(5));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const sentIds = mockSync.mock.calls.flatMap(([b]) => b.map((p) => p.id));
    expect(sentIds).toHaveLength(23);
    expect(new Set(sentIds).size).toBe(23);
  });

  // 리뷰 I-2: 요청 자체가 실패하면 남은(아직 안 보낸) 묶음도 쿨다운에 건다.
  it("묶음 요청이 일반 오류로 실패하면 실패 묶음과 남은 묶음 모두 쿨다운에 건다", async () => {
    const base = Array.from({ length: 25 }, (_, i) => makeTodo({ id: `t${i}` }));
    mockTodos = base;
    mockSync
      .mockImplementationOnce(async (batch) => batch.map((p) => ({ id: p.id, googleEventId: `evt-${p.id}` })))
      .mockRejectedValueOnce(new Error("동기화 실패: 500"));
    const { rerender } = await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(2));
    await flush();

    mockTodos = base.map((t, i) => (i < 5 ? { ...t, googleEventId: `evt-${t.id}` } : t));
    await rerender({});
    await flush();
    expect(mockSync).toHaveBeenCalledTimes(2);
  });

  // 리뷰 M-3: revoked→재연결·사용자 변경이면 예전 실패 기록은 근거가 없다.
  it("revoked 뒤 재연결하면 쿨다운 기록을 비워 실패 항목을 바로 다시 보낸다", async () => {
    mockSync.mockResolvedValueOnce([{ id: "t1", googleEventId: null, error: "403 rateLimitExceeded" }]);
    const client = makeClient();
    const { rerender } = await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(client) });
    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
    await flush();

    await act(async () => {
      client.setQueryData(["calendarIntegration", "uid-1"], { connected: true, status: "revoked" });
    });
    await flush();
    await act(async () => {
      client.setQueryData(["calendarIntegration", "uid-1"], { connected: true, status: "active" });
    });
    mockTodos = [makeTodo()];
    await rerender({});
    // 정확한 호출 횟수(타이밍에 따라 1~2번 더 돈다)가 아니라 "쿨다운에 걸렸던 t1이 다시 전송됐는지"를 본다 —
    // 쿨다운 기록이 남아 있으면 t1은 걸러져 보내지지 않는다.
    await waitFor(() => {
      const resentIds = mockSync.mock.calls.slice(1).flatMap(([batch]) => batch.map((p) => p.id));
      expect(resentIds).toContain("t1");
    });
  });

  it("로그인 사용자가 바뀌면 쿨다운 기록을 비운다", async () => {
    mockSync.mockResolvedValueOnce([{ id: "t1", googleEventId: null, error: "403 rateLimitExceeded" }]);
    const { rerender } = await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
    await flush();

    mockAuth.currentUser = { uid: "uid-2" };
    mockTodos = [makeTodo()];
    await rerender({});
    // 정확한 호출 횟수(타이밍에 따라 1~2번 더 돈다)가 아니라 "쿨다운에 걸렸던 t1이 다시 전송됐는지"를 본다 —
    // 쿨다운 기록이 남아 있으면 t1은 걸러져 보내지지 않는다.
    await waitFor(() => {
      const resentIds = mockSync.mock.calls.slice(1).flatMap(([batch]) => batch.map((p) => p.id));
      expect(resentIds).toContain("t1");
    });
  });

  // 리뷰: 뒤 묶음은 루프 시작 때 잡은 todos로 보내서, 도중에 지워진 할 일도 upsert하고 그
  // Firestore update가 batch 전체를 실패시켜 다른 항목의 googleEventId까지 잃었다.
  describe("묶음 도중 할 일이 지워지면", () => {
    const setupCache = () => {
      const base = Array.from({ length: 12 }, (_, i) => makeTodo({ id: `t${i}` }));
      mockTodos = base;
      const client = makeClient();
      client.setQueryData(["todos", "uid-1"], base);
      const removeFromCache = (id: string) =>
        client.setQueryData<Todo[]>(["todos", "uid-1"], (prev) => (prev ?? []).filter((t) => t.id !== id));
      return { client, removeFromCache };
    };

    it("다음 묶음을 보내기 전에 최신 todos 캐시를 다시 읽어, 지워진 할 일은 보내지 않는다", async () => {
      const { client, removeFromCache } = setupCache();
      mockSync.mockImplementation(async (batch) => {
        if (batch.some((p) => p.id === "t0")) removeFromCache("t7");
        return batch.map((p) => ({ id: p.id, googleEventId: `evt-${p.id}` }));
      });
      await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(client) });
      await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(3));
      const sentIds = mockSync.mock.calls.flatMap(([b]) => b.map((p) => p.id));
      expect(sentIds).not.toContain("t7");
      expect(sentIds).toHaveLength(11);
      await waitFor(() => expect(mockBatchUpdate).toHaveBeenCalledTimes(11));
    });

    it("요청 중에 지워진 할 일의 Firestore 업데이트는 batch에 넣지 않는다(batch 전체 실패 방지)", async () => {
      const { client, removeFromCache } = setupCache();
      mockSync.mockImplementation(async (batch) => {
        if (batch.some((p) => p.id === "t0")) removeFromCache("t2");
        return batch.map((p) => ({ id: p.id, googleEventId: `evt-${p.id}` }));
      });
      await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(client) });
      await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(mockBatchUpdate).toHaveBeenCalledTimes(11));
      expect(mockBatchUpdate).not.toHaveBeenCalledWith({ path: "todos/t2" }, expect.anything());
    });
  });

  it("5건을 넘으면 5건씩 나눠 순서대로(앞 요청이 끝난 뒤) 보낸다", async () => {
    mockTodos = Array.from({ length: 23 }, (_, i) => makeTodo({ id: `t${i}` }));
    let inFlight = 0;
    let maxInFlight = 0;
    mockSync.mockImplementation(async (batch) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return batch.map((p) => ({ id: p.id, googleEventId: `evt-${p.id}` }));
    });
    await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(5));
    expect(mockSync.mock.calls.map(([b]) => b.length)).toEqual([5, 5, 5, 5, 3]);
    expect(maxInFlight).toBe(1);
    await waitFor(() => expect(mockBatchUpdate).toHaveBeenCalledTimes(23));
  });

  it("묶음 도중 revoked가 나면 남은 묶음은 보내지 않고, 앞 묶음 결과는 그대로 반영한다", async () => {
    mockTodos = Array.from({ length: 25 }, (_, i) => makeTodo({ id: `t${i}` }));
    mockSync
      .mockImplementationOnce(async (batch) => batch.map((p) => ({ id: p.id, googleEventId: `evt-${p.id}` })))
      .mockRejectedValueOnce(new CalendarRevokedError());
    await renderHook(() => useSyncTodosToCalendar(), { wrapper: wrap(makeClient()) });
    await waitFor(() => expect(mockRevoked).toHaveBeenCalledTimes(1));
    await flush();
    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(5);
  });
});
