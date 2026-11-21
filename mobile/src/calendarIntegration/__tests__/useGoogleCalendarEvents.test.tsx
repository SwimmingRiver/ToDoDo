import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ReactNode } from "react";

let mockIntegration: { connected: boolean; status: "active" | "revoked" } | undefined;
jest.mock("../useCalendarIntegration", () => ({
  useCalendarIntegrationStatus: () => ({ data: mockIntegration }),
}));
let mockIsPremium = true;
jest.mock("../../premium", () => ({ useIsPremium: () => ({ isPremium: mockIsPremium, isLoading: false }) }));
jest.mock("../markCalendarRevoked", () => ({ markCalendarRevoked: jest.fn() }));
jest.mock("../calendarProxyApi", () => {
  const core = jest.requireActual("@tododo/core/dist/calendarSync/index.js") as Record<string, unknown>;
  return {
    getGoogleCalendarEvents: jest.fn(),
    CalendarRevokedError: core.CalendarRevokedError,
  };
});

import { CalendarRevokedError, getGoogleCalendarEvents } from "../calendarProxyApi";
import { markCalendarRevoked } from "../markCalendarRevoked";
import { useGoogleCalendarEvents } from "../useGoogleCalendarEvents";

const mockGetEvents = jest.mocked(getGoogleCalendarEvents);
const mockMarkRevoked = jest.mocked(markCalendarRevoked);

const makeClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
const wrap = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

const range = { start: "2026-05-31T15:00:00.000Z", end: "2026-06-30T15:00:00.000Z" };
const event = { id: "g1", title: "회의", start: "2026-06-20", end: "2026-06-21" };

beforeEach(() => {
  jest.clearAllMocks();
  mockIntegration = { connected: true, status: "active" };
  mockIsPremium = true;
  mockMarkRevoked.mockResolvedValue(undefined);
});

describe("useGoogleCalendarEvents", () => {
  it("연동 상태면 범위로 조회하고 [googleCalendarEvents, start, end] 키에 캐시한다", async () => {
    mockGetEvents.mockResolvedValue([event]);
    const client = makeClient();
    const { result } = await renderHook(() => useGoogleCalendarEvents(range), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetEvents).toHaveBeenCalledWith({ timeMin: range.start, timeMax: range.end });
    expect(result.current.data).toEqual([event]);
    expect(client.getQueryData(["googleCalendarEvents", range.start, range.end])).toEqual([event]);
  });

  it("범위가 없거나 미연동이거나 revoked면 조회하지 않는다", async () => {
    const client = makeClient();
    await renderHook(() => useGoogleCalendarEvents(null), { wrapper: wrap(client) });
    mockIntegration = { connected: false, status: "active" };
    await renderHook(() => useGoogleCalendarEvents(range), { wrapper: wrap(client) });
    mockIntegration = { connected: true, status: "revoked" };
    await renderHook(() => useGoogleCalendarEvents(range), { wrapper: wrap(client) });
    mockIntegration = undefined;
    await renderHook(() => useGoogleCalendarEvents(range), { wrapper: wrap(client) });
    expect(mockGetEvents).not.toHaveBeenCalled();
  });

  it("세션 중 프리미엄이 만료되면 캐시된 connected 상태여도 조회하지 않고 캐시된 이벤트도 내보내지 않는다", async () => {
    const client = makeClient();
    // 프리미엄일 때 받아 둔 이벤트가 캐시에 남아 있는 상황.
    client.setQueryData(["googleCalendarEvents", range.start, range.end], [event]);
    mockIsPremium = false;
    const { result } = await renderHook(() => useGoogleCalendarEvents(range), { wrapper: wrap(client) });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGetEvents).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("revoked 오류면 markCalendarRevoked를 부르고 재시도하지 않는다", async () => {
    mockGetEvents.mockRejectedValue(new CalendarRevokedError());
    const client = makeClient();
    const { result } = await renderHook(() => useGoogleCalendarEvents(range), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockMarkRevoked).toHaveBeenCalledWith(client);
    expect(mockGetEvents).toHaveBeenCalledTimes(1);
  });
});
