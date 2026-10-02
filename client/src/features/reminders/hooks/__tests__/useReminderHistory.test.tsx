import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "user-1" } } }));
const { fetchMock, seenMock, captureMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  seenMock: vi.fn(),
  captureMock: vi.fn(),
}));
vi.mock("../../api/reminderProxyApi", () => ({
  fetchReminderHistory: fetchMock,
  markReminderHistorySeen: seenMock,
}));
vi.mock("@sentry/react", () => ({ captureException: captureMock }));

import { useMarkHistorySeen, useReminderHistory } from "../useReminderHistory";

const item = (todoId: string, sentAt: number) => ({
  todoId,
  title: todoId,
  offsetMinutes: 30 as const,
  dueAt: "2026-10-01T01:00:00.000Z",
  sentAt,
});

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => ({ history: useReminderHistory(), seen: useMarkHistorySeen() }), { wrapper }) };
};

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ items: [item("b", 300), item("a", 100)], lastSeenAt: 100 });
  seenMock.mockReset().mockResolvedValue(undefined);
  captureMock.mockReset();
});

describe("useReminderHistory", () => {
  it("lastSeenAt 이후 기록 수가 unreadCount", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.history.unreadCount).toBe(1));
  });

  it("읽음 처리는 요청 전에 배지를 0으로 만든다(낙관적)", async () => {
    let resolve!: () => void;
    seenMock.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const { result } = setup();
    await waitFor(() => expect(result.current.history.unreadCount).toBe(1));
    act(() => result.current.seen.mutate(300));
    await waitFor(() => expect(result.current.history.unreadCount).toBe(0));
    expect(seenMock).toHaveBeenCalledWith(300);
    resolve();
  });

  it("읽음 처리가 실패하면 배지를 되돌리고 Sentry로 보낸다", async () => {
    seenMock.mockRejectedValue(new Error("down"));
    const { result } = setup();
    await waitFor(() => expect(result.current.history.unreadCount).toBe(1));
    act(() => result.current.seen.mutate(300));
    await waitFor(() => expect(captureMock).toHaveBeenCalled());
    expect(result.current.history.unreadCount).toBe(1);
  });

  it("읽음 처리가 끝나면(성공) 기록을 무효화해 서버 값과 맞춘다", async () => {
    const { result, client } = setup();
    await waitFor(() => expect(result.current.history.unreadCount).toBe(1));
    const spy = vi.spyOn(client, "invalidateQueries");
    act(() => result.current.seen.mutate(300));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["reminderHistory", "user-1"] }));
  });
});
