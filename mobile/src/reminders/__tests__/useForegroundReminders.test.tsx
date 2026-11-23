import { renderHook, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { ReactNode } from "react";


const mockShow = jest.fn();
jest.mock("../../firebase", () => ({ auth: {}, db: {} }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "u1" }, loading: false }),
}));
jest.mock("../../shared/lib/sentry", () => ({ reportError: jest.fn() }));
jest.mock("../components/ReminderBanner", () => ({
  useReminderBanner: () => ({ show: mockShow }),
}));

type Msg = { notification?: { title?: string; body?: string } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.Mock<(...args: any[]) => any>;

describe("useForegroundReminders", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const setup = async (status: number) => {
    const m = jest.requireMock("@react-native-firebase/messaging") as { hasPermission: AnyMock; onMessage: AnyMock };
    m.hasPermission.mockResolvedValue(status);
    const client = new QueryClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { useForegroundReminders } = await import("../hooks/useForegroundReminders");
    await renderHook(() => useForegroundReminders(), { wrapper });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    return { m, spy };
  };

  it("onMessage shows banner and refetches history after 3s", async () => {
    const { m, spy } = await setup(1);
    const cb = m.onMessage.mock.calls[0][1] as (msg: Msg) => void;
    cb({ notification: { title: "제목", body: "내용" } });
    expect(mockShow).toHaveBeenCalledWith("제목", "내용");
    expect(spy).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["reminderHistory", "u1"] });
  });

  it("no subscribe without permission", async () => {
    const { m } = await setup(0);
    expect(m.onMessage).not.toHaveBeenCalled();
  });
});
