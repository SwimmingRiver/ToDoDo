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
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));
vi.mock("../../api", () => ({
  getOAuthStartUrl: vi.fn(),
  disconnectCalendar: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("useCalendarIntegrationStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("문서가 없으면 connected: false를 반환한다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);

    const { result } = renderHook(() => useCalendarIntegrationStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ connected: false, status: "active" });
  });

  it("문서가 있으면 그 값을 반환한다", async () => {
    const { getDoc } = await import("firebase/firestore");
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ connected: true, status: "active" }),
    } as never);

    const { result } = renderHook(() => useCalendarIntegrationStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ connected: true, status: "active" });
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
  it("disconnect는 api를 호출하고 Firestore 상태를 갱신한다", async () => {
    const { disconnectCalendar } = await import("../../api");
    const { setDoc } = await import("firebase/firestore");
    vi.mocked(disconnectCalendar).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDisconnectCalendar(), { wrapper: createWrapper() });
    await result.current.disconnect(["event-1"]);

    expect(vi.mocked(disconnectCalendar)).toHaveBeenCalledWith(["event-1"]);
    expect(vi.mocked(setDoc)).toHaveBeenCalledWith(
      expect.anything(),
      { connected: false, status: "active" },
      { merge: true },
    );
  });

  it("markConnected는 Firestore에 connected: true를 기록한다", async () => {
    const { setDoc } = await import("firebase/firestore");

    const { result } = renderHook(() => useMarkCalendarConnected(), { wrapper: createWrapper() });
    await result.current.markConnected();

    expect(vi.mocked(setDoc)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ connected: true, status: "active" }),
      { merge: true },
    );
  });
});
