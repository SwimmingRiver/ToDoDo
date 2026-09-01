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

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock("@/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared")>();
  return {
    ...actual,
    useToast: () => ({ error: toastErrorMock, success: vi.fn() }),
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
    const { useConnectCalendar, useDisconnectCalendar } = await import("../../hooks");
    vi.mocked(useConnectCalendar).mockReturnValue({ connect: vi.fn() });
    vi.mocked(useDisconnectCalendar).mockReturnValue({ disconnect: vi.fn() });
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
    const disconnect = vi.fn();
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
      expect(disconnect).toHaveBeenCalledWith(["event-1", "event-3"]);
    });
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
});
