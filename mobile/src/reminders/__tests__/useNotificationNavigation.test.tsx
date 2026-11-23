import { renderHook, act } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../shared/lib/sentry", () => ({ reportError: jest.fn() }));

type Msg = { data?: { todoId?: string } } | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.Mock<(...args: any[]) => any>;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("useNotificationNavigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setup = async () => {
    const m = jest.requireMock("@react-native-firebase/messaging") as {
      onNotificationOpenedApp: AnyMock;
      getInitialNotification: AnyMock;
    };
    const nav = await import("../../navigation/navigationRef");
    const navigate = jest.spyOn(nav.navigationRef, "navigate").mockImplementation(() => {});
    const isReady = jest.spyOn(nav.navigationRef, "isReady").mockReturnValue(true);
    const { useNotificationNavigation } = await import("../hooks/useNotificationNavigation");
    return { m, nav, navigate, isReady, useNotificationNavigation };
  };

  it("background tap navigates to TodoDetail", async () => {
    const { m, navigate, useNotificationNavigation } = await setup();
    await renderHook(() => useNotificationNavigation());
    await flush();
    const cb = m.onNotificationOpenedApp.mock.calls[0][1] as (msg: Msg) => void;
    cb({ data: { todoId: "a" } });
    expect(navigate).toHaveBeenCalledWith("오늘", { screen: "TodoDetail", params: { id: "a" } });
  });

  it("queues until ready", async () => {
    const { m, nav, navigate, isReady, useNotificationNavigation } = await setup();
    isReady.mockReturnValue(false);
    m.getInitialNotification.mockResolvedValueOnce({ data: { todoId: "b" } });
    await renderHook(() => useNotificationNavigation());
    await flush();
    expect(navigate).not.toHaveBeenCalled();
    isReady.mockReturnValue(true);
    nav.flushPendingTodoDetail();
    nav.flushPendingTodoDetail();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("오늘", { screen: "TodoDetail", params: { id: "b" } });
  });

  it("ignores message without todoId", async () => {
    const { m, navigate, useNotificationNavigation } = await setup();
    await renderHook(() => useNotificationNavigation());
    await flush();
    const cb = m.onNotificationOpenedApp.mock.calls[0][1] as (msg: Msg) => void;
    cb({ data: {} });
    cb(null);
    expect(navigate).not.toHaveBeenCalled();
  });
});
