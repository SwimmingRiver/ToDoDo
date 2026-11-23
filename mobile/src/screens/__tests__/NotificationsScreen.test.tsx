import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Linking } from "react-native";

const NOW = new Date(2026, 10, 24, 12, 0).getTime();

jest.mock("../../auth/useAuthState", () => ({ useAuthState: () => ({ user: { uid: "u1" }, loading: false }) }));
jest.mock("../../shared/lib/sentry", () => ({ reportError: jest.fn() }));

const mockNavigate = jest.fn();
let mockRouteNames = ["Today", "TodoDetail", "Notifications"];
jest.mock("@react-navigation/native", () => {
  const R = require("react") as typeof import("react");
  return {
    useNavigation: () => ({ navigate: mockNavigate, getState: () => ({ routeNames: mockRouteNames }) }),
    useFocusEffect: (cb: () => void | (() => void)) => R.useEffect(cb, [cb]),
  };
});

const mockOpenTodoDetail = jest.fn();
jest.mock("../../navigation/navigationRef", () => ({ openTodoDetail: (id: string) => mockOpenTodoDetail(id) }));

const mockMarkSeen = jest.fn();
const mockSetDefault = jest.fn();
let mockHistory: { items: unknown[]; lastSeenAt: number } | undefined;
const mockGetPermission = jest.fn<() => Promise<string>>();
const mockEnable = jest.fn<(uid: string) => Promise<string>>();
jest.mock("../../reminders", () => ({
  useReminderDefault: () => ({ data: 30 }),
  useSetReminderDefault: () => ({ mutate: mockSetDefault }),
  useReminderHistory: () => ({ data: mockHistory }),
  useMarkHistorySeen: () => ({ mutate: mockMarkSeen }),
  getPushPermission: () => mockGetPermission(),
  enablePushOnThisDevice: (uid: string) => mockEnable(uid),
  subscribePushPermissionChanged: () => () => {},
}));

const item = (todoId: string, sentAt: number) => ({ todoId, title: `제목-${todoId}`, offsetMinutes: 30, dueAt: "2026-11-24T05:00:00.000Z", sentAt });

const renderScreen = async () => {
  const { NotificationsScreen } = await import("../NotificationsScreen");
  const view = await render(<NotificationsScreen />);
  await act(async () => {});
  return view;
};

describe("NotificationsScreen", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    mockHistory = { items: [], lastSeenAt: 0 };
    mockRouteNames = ["Today", "TodoDetail", "Notifications"];
    mockGetPermission.mockResolvedValue("granted");
    mockEnable.mockResolvedValue("granted");
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows enable button when undetermined and calls enablePushOnThisDevice", async () => {
    mockGetPermission.mockResolvedValue("undetermined");
    await renderScreen();
    await act(async () => { fireEvent.press(screen.getByText("켜기")); });
    expect(mockEnable).toHaveBeenCalledWith("u1");
  });

  it("granted shows on status", async () => {
    await renderScreen();
    expect(screen.getByText("알림 켜짐")).toBeTruthy();
  });

  it("denied shows open settings", async () => {
    mockGetPermission.mockResolvedValue("denied");
    const spy = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    await renderScreen();
    await fireEvent.press(screen.getByText("iOS 설정 열기"));
    expect(spy).toHaveBeenCalled();
  });

  it("changing default calls setReminderDefault with 'off'", async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText("기본 알림 시점 알림 없음"));
    expect(mockSetDefault).toHaveBeenCalledWith("off");
  });

  it("renders history with body text '30분 후 마감이에요'", async () => {
    mockHistory = { items: [item("a", NOW - 5 * 60_000)], lastSeenAt: NOW };
    await renderScreen();
    expect(screen.getByText("제목-a")).toBeTruthy();
    expect(screen.getByText("30분 후 마감이에요")).toBeTruthy();
    expect(screen.getByText("5분 전")).toBeTruthy();
  });

  it("shows empty state with no history", async () => {
    await renderScreen();
    expect(screen.getByText("아직 받은 알림이 없어요")).toBeTruthy();
  });

  it("marks seen with max sentAt on focus", async () => {
    mockHistory = { items: [item("a", 1000), item("b", 3000), item("c", 2000)], lastSeenAt: 500 };
    await renderScreen();
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(mockMarkSeen).toHaveBeenCalledWith(3000);
  });

  it("does not mark seen when nothing is new", async () => {
    mockHistory = { items: [item("a", 1000)], lastSeenAt: 1000 };
    await renderScreen();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it("tapping item navigates to TodoDetail in the same stack", async () => {
    mockHistory = { items: [item("a", 1000)], lastSeenAt: 1000 };
    await renderScreen();
    await fireEvent.press(screen.getByText("제목-a"));
    expect(mockNavigate).toHaveBeenCalledWith("TodoDetail", { id: "a" });
    expect(mockOpenTodoDetail).not.toHaveBeenCalled();
  });

  it("tapping item on a stack without TodoDetail opens it via the Today tab", async () => {
    mockRouteNames = ["Insights", "Account", "Notifications"];
    mockHistory = { items: [item("a", 1000)], lastSeenAt: 1000 };
    await renderScreen();
    await fireEvent.press(screen.getByText("제목-a"));
    expect(mockOpenTodoDetail).toHaveBeenCalledWith("a");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
