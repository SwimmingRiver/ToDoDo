import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCalendarIntegrationStatus,
  useConnectCalendar,
  useDisconnectCalendar,
  useMarkCalendarConnected,
} from "../useCalendarIntegration";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
  googleProvider: {},
}));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
const { batchUpdateMock, batchCommitMock } = vi.hoisted(() => ({
  batchUpdateMock: vi.fn(),
  batchCommitMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(() => ({ update: batchUpdateMock, commit: batchCommitMock })),
}));
vi.mock("../../api", () => ({
  getOAuthStartUrl: vi.fn(),
  disconnectCalendar: vi.fn(),
}));
vi.mock("@/features/entitlement", () => ({ useIsPremium: vi.fn() }));

// queryClient를 함께 반환한다 — 테스트가 invalidateQueries 호출 여부를
// spyOn으로 검증하려면 훅이 실제로 쓰는 인스턴스를 손에 쥐고 있어야 한다.
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
};

describe("useCalendarIntegrationStatus", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useIsPremium } = await import("@/features/entitlement");
    vi.mocked(useIsPremium).mockReturnValue({ isPremium: true, isLoading: false });
  });

  it("문서가 없으면 connected: false를 반환한다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCalendarIntegrationStatus(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ connected: false, status: "active" });
  });

  it("문서가 있으면 그 값을 반환한다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ connected: true, status: "active" }),
    } as never);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCalendarIntegrationStatus(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ connected: true, status: "active" });
  });

  it("프리미엄이 아니면 쿼리가 비활성화되어 Firestore를 조회하지 않는다", async () => {
    const { useIsPremium } = await import("@/features/entitlement");
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(useIsPremium).mockReturnValue({ isPremium: false, isLoading: false });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCalendarIntegrationStatus(), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(getDoc).not.toHaveBeenCalled();
  });
});

describe("useConnectCalendar", () => {
  it("connect는 authUrl로 페이지를 이동시킨다", async () => {
    const { getOAuthStartUrl } = await import("../../api");
    vi.mocked(getOAuthStartUrl).mockResolvedValue("https://accounts.google.com/consent");

    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, href: "" },
      writable: true,
    });

    const { result } = renderHook(() => useConnectCalendar());
    await result.current.connect();

    expect(window.location.href).toBe("https://accounts.google.com/consent");
    Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  });
});

describe("useDisconnectCalendar / useMarkCalendarConnected", () => {
  beforeEach(() => {
    batchUpdateMock.mockClear();
    batchCommitMock.mockClear();
  });

  it("disconnect는 api를 호출하고 Firestore 상태를 갱신한 뒤 연동 상태 쿼리를 무효화하며, 삭제 확인된 이벤트만 googleEventId를 지운다", async () => {
    const { disconnectCalendar } = await import("../../api");
    const { setDoc } = await import("firebase/firestore");
    vi.mocked(disconnectCalendar).mockResolvedValue({ deletedGoogleEventIds: ["event-1"] });

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDisconnectCalendar(), { wrapper: Wrapper });
    const outcome = await result.current.disconnect([
      { id: "todo-1", googleEventId: "event-1" },
      { id: "todo-2", googleEventId: "event-2" },
    ]);

    expect(vi.mocked(disconnectCalendar)).toHaveBeenCalledWith(["event-1", "event-2"]);
    // event-1(성공)만 지우고, event-2(실패)는 다음에 다시 시도할 수 있도록 그대로 둔다.
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
    expect(batchUpdateMock).toHaveBeenCalledWith(expect.anything(), { googleEventId: null });
    expect(batchCommitMock).toHaveBeenCalled();
    expect(vi.mocked(setDoc)).toHaveBeenCalledWith(
      expect.anything(),
      { connected: false, status: "active" },
      { merge: true },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["calendarIntegration", "user-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["todos"] });
    expect(outcome).toEqual({ allDeleted: false });
  });

  // todos 재조회가 연동 상태 재조회보다 먼저 끝나면, 동기화 훅이 캐시된
  // connected:true를 보고 googleEventId가 비워진 Todo 전부를 upsert하러 나간다
  // (Worker는 토큰을 이미 지워 409). 연동 상태가 먼저 disconnected로 확정된 뒤에
  // todos를 무효화해야 한다.
  it("disconnect는 연동 상태 쿼리 재조회가 끝난 뒤에 todos를 무효화한다", async () => {
    const { disconnectCalendar } = await import("../../api");
    const { getDoc } = await import("firebase/firestore");
    const { useIsPremium } = await import("@/features/entitlement");
    vi.mocked(useIsPremium).mockReturnValue({ isPremium: true, isLoading: false });
    vi.mocked(disconnectCalendar).mockResolvedValue({ deletedGoogleEventIds: ["event-1"] });
    // 마운트 시 첫 조회는 connected:true, 해제 후 재조회는 connected:false
    vi.mocked(getDoc)
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ connected: true, status: "active" }),
      } as never)
      .mockResolvedValue({
        exists: () => true,
        data: () => ({ connected: false, status: "active" }),
      } as never);

    const { Wrapper, queryClient } = createWrapper();
    let integrationWhenTodosInvalidated: unknown = "not-called";
    const original = queryClient.invalidateQueries.bind(queryClient);
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((filters, ...rest) => {
      if (JSON.stringify(filters?.queryKey) === JSON.stringify(["todos"])) {
        integrationWhenTodosInvalidated = queryClient.getQueryData(["calendarIntegration", "user-1"]);
      }
      return original(filters, ...rest);
    });

    // 실제 앱처럼 연동 상태 쿼리에 옵저버가 마운트돼 있어야 invalidate가 재조회를 일으킨다.
    const { result } = renderHook(
      () => ({ status: useCalendarIntegrationStatus(), actions: useDisconnectCalendar() }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.status.data).toEqual({ connected: true, status: "active" }));

    await result.current.actions.disconnect([{ id: "todo-1", googleEventId: "event-1" }]);

    expect(integrationWhenTodosInvalidated).toEqual({ connected: false, status: "active" });
  });

  // 스냅샷에만 남은 고아 이벤트(Todo는 삭제됐는데 이벤트 삭제가 실패해 대기 중)는
  // 구글에서는 지워야 하지만 Firestore 문서가 없으므로 googleEventId 정리 대상에
  // 넣으면 batch.update가 실패한다 — Worker에만 보낸다.
  it("disconnect는 고아 googleEventId도 Worker에 함께 보내되 Firestore 정리 대상에는 넣지 않는다", async () => {
    const { disconnectCalendar } = await import("../../api");
    vi.mocked(disconnectCalendar).mockResolvedValue({ deletedGoogleEventIds: ["event-1", "orphan-9"] });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDisconnectCalendar(), { wrapper: Wrapper });
    const outcome = await result.current.disconnect(
      [{ id: "todo-1", googleEventId: "event-1" }],
      ["orphan-9"],
    );

    expect(vi.mocked(disconnectCalendar)).toHaveBeenCalledWith(["event-1", "orphan-9"]);
    expect(batchUpdateMock).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ allDeleted: true });
  });

  it("disconnect는 googleCalendarEvents 캐시를 지워 연동 해제 후 이미 지워진 이벤트가 화면에 남아있지 않게 한다", async () => {
    const { disconnectCalendar } = await import("../../api");
    vi.mocked(disconnectCalendar).mockResolvedValue({ deletedGoogleEventIds: ["event-1"] });

    const { Wrapper, queryClient } = createWrapper();
    const removeSpy = vi.spyOn(queryClient, "removeQueries");
    const { result } = renderHook(() => useDisconnectCalendar(), { wrapper: Wrapper });
    await result.current.disconnect([{ id: "todo-1", googleEventId: "event-1" }]);

    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ["googleCalendarEvents"] });
  });

  it("모든 이벤트가 삭제 확인되면 allDeleted: true를 반환한다", async () => {
    const { disconnectCalendar } = await import("../../api");
    vi.mocked(disconnectCalendar).mockResolvedValue({ deletedGoogleEventIds: ["event-1"] });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDisconnectCalendar(), { wrapper: Wrapper });
    const outcome = await result.current.disconnect([{ id: "todo-1", googleEventId: "event-1" }]);

    expect(outcome).toEqual({ allDeleted: true });
  });

  it("markConnected는 Firestore에 connected: true와 connectedAt을 기록하고 연동 상태 쿼리를 무효화한다", async () => {
    const { setDoc } = await import("firebase/firestore");

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useMarkCalendarConnected(), { wrapper: Wrapper });
    await result.current.markConnected();

    expect(vi.mocked(setDoc)).toHaveBeenCalledWith(
      expect.anything(),
      {
        connected: true,
        connectedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        status: "active",
      },
      { merge: true },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["calendarIntegration", "user-1"] });
  });
});
