import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useGoogleCalendarEvents } from "../useGoogleCalendarEvents";

vi.mock("../../api", () => ({
  getGoogleCalendarEvents: vi.fn(),
}));
vi.mock("../useCalendarIntegration", () => ({
  useCalendarIntegrationStatus: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

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

    const { result } = renderHook(() => useGoogleCalendarEvents(), { wrapper: createWrapper() });

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

    const { result } = renderHook(() => useGoogleCalendarEvents(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: "g-1", title: "회의", start: "2026-09-05", end: "2026-09-06" },
    ]);
  });
});
