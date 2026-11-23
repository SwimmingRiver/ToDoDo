import { act, render } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Alert, Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const NOW = new Date(2026, 10, 24, 12, 0).getTime();

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));
jest.mock("../../auth/useAuthState", () => ({ useAuthState: () => ({ user: { uid: "u1" }, loading: false }) }));
jest.mock("../../shared/lib/sentry", () => ({ reportError: jest.fn() }));

let mockDefault: unknown = 30;
jest.mock("../hooks/useReminderSettings", () => ({
  useReminderDefault: () => ({ data: mockDefault }),
}));

const mockGetPermission = jest.fn<() => Promise<string>>();
const mockEnable = jest.fn<(uid: string) => Promise<string>>();
jest.mock("../push/pushClient", () => ({
  getPushPermission: () => mockGetPermission(),
  enablePushOnThisDevice: (uid: string) => mockEnable(uid),
}));

const getItem = jest.mocked(AsyncStorage.getItem);
const setItem = jest.mocked(AsyncStorage.setItem);

type AlertButton = { text: string; style?: string; onPress?: () => unknown };

describe("ReminderPromptProvider", () => {
  let alertSpy: jest.SpiedFunction<typeof Alert.alert>;
  let maybePrompt: () => void = () => {};

  const renderProvider = async () => {
    const { ReminderPromptProvider, useReminderPrompt } = await import("../components/ReminderPromptProvider");
    const Probe = () => {
      maybePrompt = useReminderPrompt().maybePrompt;
      return <Text>probe</Text>;
    };
    await render(
      <ReminderPromptProvider>
        <Probe />
      </ReminderPromptProvider>,
    );
  };
  const prompt = async () => {
    await act(async () => {
      maybePrompt();
    });
  };
  const buttons = () => (alertSpy.mock.calls.at(-1) as unknown as [string, string, AlertButton[]])[2];

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    mockDefault = 30;
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue(undefined);
    mockGetPermission.mockResolvedValue("undetermined");
    mockEnable.mockResolvedValue("granted");
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    alertSpy.mockRestore();
    jest.useRealTimers();
  });

  it("shows when undetermined", async () => {
    await renderProvider();
    await prompt();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith("마감 알림", "마감 30분 전에 알려드릴까요?", expect.any(Array));
    expect(buttons().map((b) => b.text)).toEqual(["나중에", "켜기"]);
  });

  it("not when granted", async () => {
    mockGetPermission.mockResolvedValue("granted");
    await renderProvider();
    await prompt();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("not when denied", async () => {
    mockGetPermission.mockResolvedValue("denied");
    await renderProvider();
    await prompt();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("not when user default is off", async () => {
    mockDefault = "off";
    await renderProvider();
    await prompt();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("uses the default setting label when the default is not loaded", async () => {
    mockDefault = undefined;
    await renderProvider();
    await prompt();
    expect(alertSpy).toHaveBeenCalledWith("마감 알림", "마감 30분 전에 알려드릴까요?", expect.any(Array));
  });

  it("later snoozes", async () => {
    await renderProvider();
    await prompt();
    await act(async () => {
      buttons().find((b) => b.text === "나중에")?.onPress?.();
    });
    expect(setItem).toHaveBeenCalledWith("tododo:reminderPromptSnoozedAt", String(NOW));
    expect(mockEnable).not.toHaveBeenCalled();
  });

  it("does not show within 7 days of snoozing", async () => {
    getItem.mockResolvedValue(String(NOW - (7 * 24 * 60 * 60 * 1000 - 1)));
    await renderProvider();
    await prompt();
    expect(getItem).toHaveBeenCalledWith("tododo:reminderPromptSnoozedAt");
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("shows again once 7 days have passed since snoozing", async () => {
    getItem.mockResolvedValue(String(NOW - 7 * 24 * 60 * 60 * 1000));
    await renderProvider();
    await prompt();
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it("shows when snooze storage cannot be read", async () => {
    getItem.mockRejectedValue(new Error("storage"));
    await renderProvider();
    await prompt();
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it("enable calls enablePushOnThisDevice", async () => {
    await renderProvider();
    await prompt();
    await act(async () => {
      await buttons().find((b) => b.text === "켜기")?.onPress?.();
    });
    expect(mockEnable).toHaveBeenCalledWith("u1");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("reports enable failures", async () => {
    const { reportError } = jest.requireMock("../../shared/lib/sentry") as { reportError: jest.Mock };
    const error = new Error("boom");
    mockEnable.mockRejectedValue(error);
    await renderProvider();
    await prompt();
    await act(async () => {
      await buttons().find((b) => b.text === "켜기")?.onPress?.();
    });
    expect(reportError).toHaveBeenCalledWith(error, "reminder");
  });

  it("does not stack prompts when called twice in a row", async () => {
    await renderProvider();
    await act(async () => {
      maybePrompt();
      maybePrompt();
    });
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });
});
