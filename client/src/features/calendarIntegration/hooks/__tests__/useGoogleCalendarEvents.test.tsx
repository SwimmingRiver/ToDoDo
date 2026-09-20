import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useGoogleCalendarEvents } from "../useGoogleCalendarEvents";
import { CalendarRevokedError } from "../../api";

vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
  googleProvider: {},
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../api", async () => {
  const actual = await vi.importActual("../../api");
  return { ...actual, getGoogleCalendarEvents: vi.fn() };
});
vi.mock("../useCalendarIntegration", () => ({
  useCalendarIntegrationStatus: vi.fn(),
}));

const createWrapper = () => {
  // 기본 retry(3회)를 살려둔다 — revoked 에러는 재시도하지 않아야 한다는 것도 검증 대상.
  const queryClient = new QueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const anyRange = { start: "2026-08-30T15:00:00.000Z", end: "2026-10-10T15:00:00.000Z" };

describe("useGoogleCalendarEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("연동 안 됐으면 조회하지 않는다(disabled)", async () => {
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { getGoogleCalendarEvents } = await import("../../api");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: false, status: "active" },
    } as never);

    const { result } = renderHook(() => useGoogleCalendarEvents(anyRange), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(vi.mocked(getGoogleCalendarEvents)).not.toHaveBeenCalled();
  });

  it("연동됐으면 이벤트 목록을 조회한다", async () => {
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { getGoogleCalendarEvents } = await import("../../api");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(getGoogleCalendarEvents).mockResolvedValue([
      { id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" },
    ]);

    const { result } = renderHook(() => useGoogleCalendarEvents(anyRange), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" },
    ]);
  });

  // 토큰이 철회되면 sync 경로(useSyncTodosToCalendar)와 똑같이 Firestore에
  // status:"revoked"를 기록해야 연결 버튼이 "다시 연결" 안내를 띄운다.
  it("조회가 CalendarRevokedError로 실패하면 연동 상태를 revoked로 기록하고 재시도하지 않는다", async () => {
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { getGoogleCalendarEvents } = await import("../../api");
    const { setDoc } = await import("firebase/firestore");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(getGoogleCalendarEvents).mockRejectedValue(new CalendarRevokedError());

    const { result } = renderHook(() => useGoogleCalendarEvents(anyRange), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(vi.mocked(setDoc)).toHaveBeenCalledWith(
      expect.anything(),
      { status: "revoked" },
      { merge: true },
    );
    expect(vi.mocked(getGoogleCalendarEvents)).toHaveBeenCalledTimes(1);
  });

  // 오버레이가 "오늘+30일"에 고정되지 않고 캘린더가 보여주는 달을 따라가려면
  // 뷰 범위가 쿼리 키와 요청 파라미터에 들어가야 한다.
  it("뷰 범위를 받아 timeMin/timeMax로 조회하고, 범위가 바뀌면 다시 조회한다", async () => {
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { getGoogleCalendarEvents } = await import("../../api");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(getGoogleCalendarEvents).mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ range }) => useGoogleCalendarEvents(range),
      {
        wrapper: createWrapper(),
        initialProps: {
          range: { start: "2026-08-30T15:00:00.000Z", end: "2026-10-10T15:00:00.000Z" },
        },
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(getGoogleCalendarEvents)).toHaveBeenCalledWith({
      timeMin: "2026-08-30T15:00:00.000Z",
      timeMax: "2026-10-10T15:00:00.000Z",
    });

    rerender({ range: { start: "2026-09-27T15:00:00.000Z", end: "2026-11-07T15:00:00.000Z" } });

    await waitFor(() =>
      expect(vi.mocked(getGoogleCalendarEvents)).toHaveBeenCalledWith({
        timeMin: "2026-09-27T15:00:00.000Z",
        timeMax: "2026-11-07T15:00:00.000Z",
      }),
    );
  });

  it("뷰 범위를 아직 모르면(null) 조회하지 않는다", async () => {
    const { useCalendarIntegrationStatus } = await import("../useCalendarIntegration");
    const { getGoogleCalendarEvents } = await import("../../api");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);

    const { result } = renderHook(() => useGoogleCalendarEvents(null), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(vi.mocked(getGoogleCalendarEvents)).not.toHaveBeenCalled();
  });
});
