import { render, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../firebase", () => ({ db: {} }));
jest.mock("@tododo/core", () => ({ runStartupMaintenance: jest.fn() }));
jest.mock("../../maintenance/maintenanceSchedule", () => ({
  ...(jest.requireActual("../../maintenance/maintenanceSchedule") as object),
  readLastSuccess: jest.fn(),
  writeLastSuccess: jest.fn(),
}));
jest.mock("../../auth/useAuthState", () => ({ useAuthState: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ NavigationContainer: ({ children }: { children: unknown }) => children }));
jest.mock("@react-navigation/bottom-tabs", () => ({
  createBottomTabNavigator: () => ({ Navigator: () => null, Screen: () => null }),
}));
jest.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({ Navigator: () => null, Screen: () => null }),
}));
jest.mock("lucide-react-native", () => ({ Sun: () => null, ListTodo: () => null, CalendarDays: () => null, UserRound: () => null }));
jest.mock("../../screens/LoginScreen", () => ({ LoginScreen: () => null }));
jest.mock("../../screens/TodayScreen", () => ({ TodayScreen: () => null }));
jest.mock("../../screens/TodoListScreen", () => ({ TodoListScreen: () => null }));
jest.mock("../../screens/TodoFormScreen", () => ({ TodoFormScreen: () => null }));
jest.mock("../../screens/TodoDetailScreen", () => ({ TodoDetailScreen: () => null }));
jest.mock("../../screens/CalendarScreen", () => ({ CalendarScreen: () => null }));
jest.mock("../../screens/AccountScreen", () => ({ AccountScreen: () => null }));
jest.mock("../../shared/ui/iconButton/IconButton", () => ({ IconButton: () => null }));

import { runStartupMaintenance } from "@tododo/core";
import { readLastSuccess } from "../../maintenance/maintenanceSchedule";
import { useAuthState } from "../../auth/useAuthState";
import { resetStartupMaintenanceState } from "../../maintenance/useStartupMaintenance";
import { RootNavigator } from "../RootNavigator";

const runMock = runStartupMaintenance as unknown as jest.Mock<(...a: unknown[]) => Promise<unknown>>;
const authMock = useAuthState as unknown as jest.Mock<() => { user: { uid: string } | null; loading: boolean }>;
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
