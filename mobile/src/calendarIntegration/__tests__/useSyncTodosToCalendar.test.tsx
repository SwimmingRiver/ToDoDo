import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
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
});
