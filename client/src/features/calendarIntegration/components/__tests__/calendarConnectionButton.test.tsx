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
});
