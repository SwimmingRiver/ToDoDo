import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import CalendarConnectionButton from "../calendarConnectionButton";

vi.mock("../../hooks", () => ({
  useCalendarIntegrationStatus: vi.fn(),
  useConnectCalendar: vi.fn(),
  useDisconnectCalendar: vi.fn(),
}));
vi.mock("@/features/todo", () => ({
  useGetTodos: vi.fn(() => ({ data: [] })),
}));
// @/features/entitlement를 importOriginal로 실행하려면 그 안에서 정적으로 물고
// 있는 @/shared/lib/firebase(getAuth 호출)까지 실제로 로드된다 — CI에는 .env가
// 없어 getAuth()가 auth/invalid-api-key로 던진다(로컬은 .env의 실제 키로
// 우연히 통과했었다). 다른 firebase 의존 테스트들과 동일하게 목으로 대체한다.
vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
  googleProvider: {},
}));
// PremiumGate/PremiumLockedNotice/useUpgradeInterest는 실제 구현을 그대로 쓴다
// (전부 이번 세션에서 만든 공용 로직이라, 여기서 목킹하면 그 재사용 자체가
// 검증되지 않는다). useIsPremium만 시나리오별로 덮어쓴다.
vi.mock("@/features/entitlement", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/entitlement")>();
  return { ...actual, useIsPremium: vi.fn() };
});
vi.mock("@/features/feedback/hooks", () => ({
  useSubmitFeedback: vi.fn(),
}));

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));
vi.mock("@/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared")>();
  return {
    ...actual,
    useToast: () => ({ error: toastErrorMock, success: toastSuccessMock }),
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("CalendarConnectionButton", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    toastErrorMock.mockClear();
    toastSuccessMock.mockClear();
    const { useConnectCalendar, useDisconnectCalendar } = await import("../../hooks");
    const { useIsPremium } = await import("@/features/entitlement");
    const { useSubmitFeedback } = await import("@/features/feedback/hooks");
    vi.mocked(useConnectCalendar).mockReturnValue({ connect: vi.fn() });
    vi.mocked(useDisconnectCalendar).mockReturnValue({ disconnect: vi.fn() });
    // 대부분의 테스트는 기존 프리미엄 사용자 시나리오(연동/해제)를 다루므로
    // 기본값을 premium으로 두고, 잠금 상태 테스트에서만 개별적으로 덮어쓴다.
    vi.mocked(useIsPremium).mockReturnValue({ isPremium: true, isLoading: false });
    vi.mocked(useSubmitFeedback).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  });

  it("연동 안 됐으면 '구글 캘린더 연동' 버튼을 보여준다", async () => {
    const { useCalendarIntegrationStatus } = await import("../../hooks");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: false, status: "active" },
    } as never);

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    expect(screen.getByText("구글 캘린더 연동")).toBeInTheDocument();
  });

  it("연동 버튼을 클릭하면 connect가 호출된다", async () => {
    const { useCalendarIntegrationStatus, useConnectCalendar } = await import("../../hooks");
    const connect = vi.fn();
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: false, status: "active" },
    } as never);
    vi.mocked(useConnectCalendar).mockReturnValue({ connect });

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText("구글 캘린더 연동"));

    await waitFor(() => expect(connect).toHaveBeenCalled());
  });

  it("연동됐으면 '연동 해제' 버튼을 보여준다", async () => {
    const { useCalendarIntegrationStatus } = await import("../../hooks");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    expect(screen.getByText("연동 해제")).toBeInTheDocument();
  });

  it("status가 revoked면 재연결 안내를 보여준다", async () => {
    const { useCalendarIntegrationStatus } = await import("../../hooks");
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "revoked" },
    } as never);

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    expect(screen.getByText(/다시 연결해주세요/)).toBeInTheDocument();
  });

  it("연동 해제 버튼을 클릭하면 googleEventId가 있는 Todo만 골라 disconnect가 호출된다", async () => {
    const { useCalendarIntegrationStatus, useDisconnectCalendar } = await import("../../hooks");
    const { useGetTodos } = await import("@/features/todo");
    const disconnect = vi.fn().mockResolvedValue({ allDeleted: true });
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(useDisconnectCalendar).mockReturnValue({ disconnect });
    vi.mocked(useGetTodos).mockReturnValue({
      data: [
        { id: "todo-1", googleEventId: "event-1" },
        { id: "todo-2", googleEventId: null },
        { id: "todo-3", googleEventId: "event-3" },
      ],
    } as never);

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText("연동 해제"));

    await waitFor(() => {
      expect(disconnect).toHaveBeenCalledWith(
        [
          { id: "todo-1", googleEventId: "event-1" },
          { id: "todo-3", googleEventId: "event-3" },
        ],
        [],
      );
    });
  });

  // Todo가 삭제됐는데 이벤트 삭제가 실패해 스냅샷에만 남은 고아 이벤트는 현재
  // Todo 목록엔 없다 — 스냅샷에서 읽어 함께 보내지 않으면 해제 후 스냅샷이
  // 비워지면서 그 이벤트는 구글에 영영 남는다.
  it("연동 해제 시 스냅샷에만 남은 고아 이벤트 id도 함께 보낸다", async () => {
    const { useCalendarIntegrationStatus, useDisconnectCalendar } = await import("../../hooks");
    const { useGetTodos } = await import("@/features/todo");
    const disconnect = vi.fn().mockResolvedValue({ allDeleted: true });
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(useDisconnectCalendar).mockReturnValue({ disconnect });
    vi.mocked(useGetTodos).mockReturnValue({
      data: [{ id: "todo-1", googleEventId: "event-1" }],
    } as never);
    localStorage.setItem(
      "calendarSyncSnapshot:user-1",
      JSON.stringify([
        ["todo-1", { updatedAt: "x", googleEventId: "event-1" }],
        ["deleted-todo", { updatedAt: "x", googleEventId: "orphan-9" }],
      ]),
    );

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText("연동 해제"));

    await waitFor(() => {
      expect(disconnect).toHaveBeenCalledWith(
        [{ id: "todo-1", googleEventId: "event-1" }],
        ["orphan-9"],
      );
    });
    localStorage.clear();
  });

  it("connect가 실패하면 에러 토스트를 보여준다", async () => {
    const { useCalendarIntegrationStatus, useConnectCalendar } = await import("../../hooks");
    const connect = vi.fn().mockRejectedValue(new Error("start failed"));
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: false, status: "active" },
    } as never);
    vi.mocked(useConnectCalendar).mockReturnValue({ connect });

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText("구글 캘린더 연동"));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it("disconnect가 성공하면(allDeleted: true) 완료 토스트를 보여준다", async () => {
    const { useCalendarIntegrationStatus, useDisconnectCalendar } = await import("../../hooks");
    const disconnect = vi.fn().mockResolvedValue({ allDeleted: true });
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(useDisconnectCalendar).mockReturnValue({ disconnect });

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText("연동 해제"));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });

  it("disconnect가 일부만 삭제했으면(allDeleted: false) 남아있을 수 있다는 경고 토스트를 보여준다", async () => {
    const { useCalendarIntegrationStatus, useDisconnectCalendar } = await import("../../hooks");
    const disconnect = vi.fn().mockResolvedValue({ allDeleted: false });
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(useDisconnectCalendar).mockReturnValue({ disconnect });

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText("연동 해제"));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("disconnect가 실패하면 에러 토스트를 보여준다", async () => {
    const { useCalendarIntegrationStatus, useDisconnectCalendar } = await import("../../hooks");
    const disconnect = vi.fn().mockRejectedValue(new Error("disconnect failed"));
    vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
      data: { connected: true, status: "active" },
    } as never);
    vi.mocked(useDisconnectCalendar).mockReturnValue({ disconnect });

    render(<CalendarConnectionButton />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByText("연동 해제"));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  describe("프리미엄이 아닌 사용자", () => {
    it("연동 상태와 무관하게 잠금 안내를 보여주고 연동/해제 버튼을 렌더링하지 않는다", async () => {
      const { useCalendarIntegrationStatus } = await import("../../hooks");
      const { useIsPremium } = await import("@/features/entitlement");
      vi.mocked(useCalendarIntegrationStatus).mockReturnValue({
        data: undefined,
      } as never);
      vi.mocked(useIsPremium).mockReturnValue({ isPremium: false, isLoading: false });

      render(<CalendarConnectionButton />, { wrapper: createWrapper() });

      expect(screen.getByText("구글 캘린더 연동 (프리미엄)")).toBeInTheDocument();
      expect(screen.queryByText("연동 해제")).not.toBeInTheDocument();
    });

    it("엔타이틀먼트 로딩 중이면 아무것도 렌더링하지 않는다", async () => {
      const { useIsPremium } = await import("@/features/entitlement");
      vi.mocked(useIsPremium).mockReturnValue({ isPremium: false, isLoading: true });

      const { container } = render(<CalendarConnectionButton />, { wrapper: createWrapper() });

      expect(container).toBeEmptyDOMElement();
    });

    it("'관심 있어요'를 클릭하면 프리미엄 관심 피드백을 제출하고 성공 토스트를 보여준다", async () => {
      const { useIsPremium } = await import("@/features/entitlement");
      const { useSubmitFeedback } = await import("@/features/feedback/hooks");
      const mutate = vi.fn((_content, options) => options?.onSuccess?.());
      vi.mocked(useIsPremium).mockReturnValue({ isPremium: false, isLoading: false });
      vi.mocked(useSubmitFeedback).mockReturnValue({ mutate, isPending: false } as never);

      render(<CalendarConnectionButton />, { wrapper: createWrapper() });
      fireEvent.click(screen.getByText("관심 있어요"));

      expect(mutate).toHaveBeenCalledWith(
        expect.stringContaining("구글 캘린더 연동"),
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
      await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    });
  });
});
