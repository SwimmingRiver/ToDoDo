import { render, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../firebase", () => ({ db: {} }));
const mockHideSplash = jest.fn();
jest.mock("../../shared/lib/splash", () => ({ hideSplash: () => mockHideSplash() }));
jest.mock("@tododo/core", () => ({ runStartupMaintenance: jest.fn() }));
jest.mock("../../maintenance/maintenanceSchedule", () => ({
  ...(jest.requireActual("../../maintenance/maintenanceSchedule") as object),
  readLastSuccess: jest.fn(),
  writeLastSuccess: jest.fn(),
}));
jest.mock("../../premium", () => ({ useEntitlementSync: jest.fn() }));
jest.mock("../../calendarIntegration/useSyncTodosToCalendar", () => ({ useSyncTodosToCalendar: jest.fn() }));
jest.mock("../../premium/iap/resumePending", () => ({ resumePendingPurchases: jest.fn() }));
jest.mock("../../auth/useAuthState", () => ({ useAuthState: jest.fn() }));
jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: { children: unknown }) => children,
  createNavigationContainerRef: () => ({ isReady: () => false, navigate: jest.fn() }),
}));
jest.mock("../../reminders", () => ({
  ReminderBannerProvider: ({ children }: { children: unknown }) => children,
  ReminderPromptProvider: ({ children }: { children: unknown }) => children,
  usePushTokenSync: jest.fn(),
  useReminderRefresh: jest.fn(),
  useForegroundReminders: jest.fn(),
  useNotificationNavigation: jest.fn(),
  useRefreshHistoryOnForeground: jest.fn(),
  cancelLegacyLocalRemindersOnce: jest.fn(() => Promise.resolve()),
}));
// 탭은 각 스택 컴포넌트를 렌더하고, 스택은 등록된 Screen(name/options)을 mockStackScreens에 모은다.
const mockStackScreens: { name: string; options?: { title?: string } }[] = [];
jest.mock("@react-navigation/bottom-tabs", () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: { children: unknown }) => children,
    Screen: ({ component: C }: { component: () => null }) => <C />,
  }),
}));
jest.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: unknown }) => children,
    Screen: (props: { name: string; options?: { title?: string } }) => {
      mockStackScreens.push(props);
      return null;
    },
  }),
}));
jest.mock("lucide-react-native", () => ({ Sun: () => null, ListTodo: () => null, CalendarDays: () => null, UserRound: () => null, ChartColumn: () => null }));
jest.mock("../../screens/LoginScreen", () => ({ LoginScreen: () => null }));
jest.mock("../../screens/TodayScreen", () => ({ TodayScreen: () => null }));
jest.mock("../../screens/TodoListScreen", () => ({ TodoListScreen: () => null }));
jest.mock("../../screens/TodoFormScreen", () => ({ TodoFormScreen: () => null }));
jest.mock("../../screens/TodoDetailScreen", () => ({ TodoDetailScreen: () => null }));
jest.mock("../../screens/CalendarScreen", () => ({ CalendarScreen: () => null }));
jest.mock("../../screens/AccountScreen", () => ({ AccountScreen: () => null }));
jest.mock("../../screens/NotificationsScreen", () => ({ NotificationsScreen: () => null }));
jest.mock("../../screens/AiPlanScreen", () => ({ AiPlanScreen: () => null }));
jest.mock("../../screens/InsightsScreen", () => ({ InsightsScreen: () => null }));
jest.mock("../../shared/ui/iconButton/IconButton", () => ({ IconButton: () => null }));

import { runStartupMaintenance } from "@tododo/core";
import { readLastSuccess } from "../../maintenance/maintenanceSchedule";
import { useAuthState } from "../../auth/useAuthState";
import { resetStartupMaintenanceState } from "../../maintenance/useStartupMaintenance";
import { resumePendingPurchases } from "../../premium/iap/resumePending";
import { RootNavigator } from "../RootNavigator";

const runMock = runStartupMaintenance as unknown as jest.Mock<(...a: unknown[]) => Promise<unknown>>;
const authMock = useAuthState as unknown as jest.Mock<() => { user: { uid: string } | null; loading: boolean }>;
const resumeMock = resumePendingPurchases as unknown as jest.Mock<() => Promise<void>>;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("RootNavigator 정리 작업", () => {
  beforeEach(() => {
    resetStartupMaintenanceState();
    runMock.mockReset().mockResolvedValue({ written: 0, failedSweeps: [] });
    (readLastSuccess as unknown as jest.Mock<() => Promise<null>>).mockResolvedValue(null);
  });

  it("로그인 -> 로그아웃 -> 같은 계정 재로그인하면 다시 실행한다", async () => {
    const client = new QueryClient();
    const ui = () => (
      <QueryClientProvider client={client}>
        <RootNavigator />
      </QueryClientProvider>
    );
    authMock.mockReturnValue({ user: { uid: "u1" }, loading: false });
    const r = await render(ui());
    await flush();
    expect(runMock).toHaveBeenCalledTimes(1);

    authMock.mockReturnValue({ user: null, loading: false });
    await r.rerender(ui());
    await flush();
    authMock.mockReturnValue({ user: { uid: "u1" }, loading: false });
    await r.rerender(ui());
    await flush();
    expect(runMock).toHaveBeenCalledTimes(2);
  });
});

describe("RootNavigator 미처리 거래 재검증", () => {
  beforeEach(() => {
    resetStartupMaintenanceState();
    runMock.mockReset().mockResolvedValue({ written: 0, failedSweeps: [] });
    (readLastSuccess as unknown as jest.Mock<() => Promise<null>>).mockResolvedValue(null);
    resumeMock.mockReset().mockResolvedValue(undefined);
  });

  it("로그인 상태에서만 1회 부르고, 다시 렌더해도 또 부르지 않는다", async () => {
    const client = new QueryClient();
    const ui = () => (
      <QueryClientProvider client={client}>
        <RootNavigator />
      </QueryClientProvider>
    );
    authMock.mockReturnValue({ user: null, loading: false });
    const r = await render(ui());
    await flush();
    expect(resumeMock).not.toHaveBeenCalled();

    authMock.mockReturnValue({ user: { uid: "u1" }, loading: false });
    await r.rerender(ui());
    await flush();
    await r.rerender(ui());
    await flush();
    expect(resumeMock).toHaveBeenCalledTimes(1);
  });
});

describe("RootNavigator 라우트", () => {
  it("목록 스택에만 AiPlan 화면이 있고 제목은 「AI로 계획」", async () => {
    mockStackScreens.length = 0;
    authMock.mockReturnValue({ user: { uid: "u1" }, loading: false });
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <RootNavigator />
      </QueryClientProvider>,
    );
    const aiPlan = mockStackScreens.filter((s) => s.name === "AiPlan");
    expect(aiPlan).toHaveLength(1);
    expect(aiPlan[0].options?.title).toBe("AI로 계획");
  });

  it("로그인하면 통계 스택에 Insights·Account가 등록된다", async () => {
    mockStackScreens.length = 0;
    authMock.mockReturnValue({ user: { uid: "u1" }, loading: false });
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <RootNavigator />
      </QueryClientProvider>,
    );
    const insights = mockStackScreens.filter((s) => s.name === "Insights");
    expect(insights).toHaveLength(1);
    expect(insights[0].options?.title).toBe("통계");
    expect(mockStackScreens.filter((s) => s.name === "Account")).toHaveLength(4);
    expect(mockStackScreens.filter((s) => s.name === "Notifications")).toHaveLength(4);
  });

  it("인증 상태를 확인하는 동안은 스플래시를 유지하고, 정해지면 숨긴다", async () => {
    mockHideSplash.mockClear();
    authMock.mockReturnValue({ user: null, loading: true });
    const view = await render(<QueryClientProvider client={new QueryClient()}><RootNavigator /></QueryClientProvider>);
    await flush();
    expect(mockHideSplash).not.toHaveBeenCalled();
    authMock.mockReturnValue({ user: null, loading: false });
    await view.rerender(<QueryClientProvider client={new QueryClient()}><RootNavigator /></QueryClientProvider>);
    await flush();
    expect(mockHideSplash).toHaveBeenCalled();
  });
});


describe("RootNavigator 옛 로컬 알림 취소", () => {
  it("로그아웃 상태에서도 앱 시작 시 옛 로컬 알림 취소를 부른다", async () => {
    const { cancelLegacyLocalRemindersOnce } = jest.requireMock("../../reminders") as {
      cancelLegacyLocalRemindersOnce: jest.Mock<() => Promise<void>>;
    };
    cancelLegacyLocalRemindersOnce.mockClear();
    authMock.mockReturnValue({ user: null, loading: false });
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <RootNavigator />
      </QueryClientProvider>,
    );
    await flush();
    expect(cancelLegacyLocalRemindersOnce).toHaveBeenCalledTimes(1);
  });

  it("취소가 실패하면 reminder로 보고한다", async () => {
    const { cancelLegacyLocalRemindersOnce } = jest.requireMock("../../reminders") as {
      cancelLegacyLocalRemindersOnce: jest.Mock<() => Promise<void>>;
    };
    const sentryMock = jest.requireMock("@sentry/react-native") as { captureException: jest.Mock };
    sentryMock.captureException.mockClear();
    cancelLegacyLocalRemindersOnce.mockReset().mockRejectedValueOnce(new Error("native"));
    authMock.mockReturnValue({ user: null, loading: false });
    await render(
      <QueryClientProvider client={new QueryClient()}>
        <RootNavigator />
      </QueryClientProvider>,
    );
    await flush();
    expect(sentryMock.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { feature: "reminder" } });
    cancelLegacyLocalRemindersOnce.mockImplementation(() => Promise.resolve());
  });
});
