import React from "react";
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  hasUnreadReminders,
  useMarkHistorySeen,
  useRefreshHistoryOnForeground,
  useReminderHistory,
} from "../hooks/useReminderHistory";

jest.mock("../../firebase", () => ({ auth: {}, db: {} }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));
const mockReportError = jest.fn();
jest.mock("../../shared/lib/sentry", () => ({ reportError: (...args: unknown[]) => mockReportError(...args) }));
jest.mock("../api/reminderProxyApi", () => ({
  fetchReminderHistory: jest.fn(() => Promise.resolve({ items: [], lastSeenAt: 0 })),
  markReminderHistorySeen: jest.fn(),
}));

const item = (sentAt: number) => ({ todoId: "a", title: "t", offsetMinutes: 30 as const, dueAt: "x", sentAt });

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
afterEach(() => {
  client?.clear();
});

describe("hasUnreadReminders", () => {
  it("hasUnreadReminders true when sentAt > lastSeenAt", () => {
    expect(hasUnreadReminders({ items: [item(5), item(20)], lastSeenAt: 10 })).toBe(true);
  });

  it("false when empty", () => {
    expect(hasUnreadReminders({ items: [], lastSeenAt: 0 })).toBe(false);
    expect(hasUnreadReminders(undefined)).toBe(false);
  });
});

describe("useRefreshHistoryOnForeground", () => {
  it("invalidates the history query when the app becomes active", async () => {
    type Listener = (state: string) => void;
    const listeners: Listener[] = [];
    const remove = jest.fn();
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, l: Listener) => {
      listeners.push(l);
      return { remove };
    }) as never);
    client = new QueryClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");

    const { unmount } = await renderHook(() => useRefreshHistoryOnForeground(), { wrapper });
    expect(listeners).toHaveLength(1);
    listeners[0]("background");
    expect(invalidate).not.toHaveBeenCalled();
    listeners[0]("active");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reminderHistory", "u1"] });
    await unmount();
    expect(remove).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("useReminderHistory staleTime", () => {
  it("history stays fresh for 30s so header remounts do not refetch", async () => {
    client = new QueryClient();
    const { result } = await renderHook(() => useReminderHistory(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryCache().find({ queryKey: ["reminderHistory", "u1"] })?.isStale()).toBe(false);
  });
});

describe("error reporting", () => {
  const api = jest.requireMock("../api/reminderProxyApi") as {
    fetchReminderHistory: jest.Mock<() => Promise<unknown>>;
    markReminderHistorySeen: jest.Mock<(n: number) => Promise<void>>;
  };

  it("reports history fetch failures as reminder errors", async () => {
    const err = new Error("fetch");
    mockReportError.mockClear();
    // 훅이 retry: 1이라 두 번 모두 실패시키고 끝까지 기다린다(재시도 타이머가 남지 않게).
    api.fetchReminderHistory.mockRejectedValueOnce(err).mockRejectedValueOnce(err);
    client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retryDelay: 0 } } });
    const { result } = await renderHook(() => useReminderHistory(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockReportError).toHaveBeenCalledWith(err, "reminder");
  });

  it("reports mark-seen failures as reminder errors", async () => {
    const err = new Error("seen");
    mockReportError.mockClear();
    api.markReminderHistorySeen.mockRejectedValueOnce(err);
    client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
    const { result } = await renderHook(() => useMarkHistorySeen(), { wrapper });
    result.current.mutate(100);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockReportError).toHaveBeenCalledWith(err, "reminder");
  });
});
