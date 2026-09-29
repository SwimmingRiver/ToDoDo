import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "user-1" } } }));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
const { getDocMock, setDocMock } = vi.hoisted(() => ({ getDocMock: vi.fn(), setDocMock: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, col, id) => ({ path: `${col}/${id}` })),
  getDoc: getDocMock,
  setDoc: setDocMock,
}));
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("../../api/reminderProxyApi", () => ({ requestReminderRefresh: refreshMock }));

import { useReminderDefault, useSetReminderDefault } from "../useReminderSettings";

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  getDocMock.mockReset();
  setDocMock.mockReset().mockResolvedValue(undefined);
  refreshMock.mockReset().mockResolvedValue(undefined);
});

describe("useReminderDefault", () => {
  it("문서가 없으면 30분", async () => {
    getDocMock.mockResolvedValue({ exists: () => false });
    const { result } = renderHook(() => useReminderDefault(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBe(30));
  });

  it("저장된 값을 읽고, 이상한 값이면 30분", async () => {
    getDocMock.mockResolvedValueOnce({ exists: () => true, data: () => ({ reminderDefaultOffsetMinutes: "off" }) });
    const { result } = renderHook(() => useReminderDefault(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBe("off"));

    getDocMock.mockResolvedValueOnce({ exists: () => true, data: () => ({ reminderDefaultOffsetMinutes: 7 }) });
    const { result: r2 } = renderHook(() => useReminderDefault(), { wrapper: wrapper() });
    await waitFor(() => expect(r2.current.data).toBe(30));
  });
});

describe("useSetReminderDefault", () => {
  it("userSettings/{uid}에 쓰고 refresh 신호를 보낸다", async () => {
    const { result } = renderHook(() => useSetReminderDefault(), { wrapper: wrapper() });
    await act(() => result.current.mutateAsync(60));
    expect(setDocMock).toHaveBeenCalledWith({ path: "userSettings/user-1" }, { reminderDefaultOffsetMinutes: 60 });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
