import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { cancelLegacyLocalRemindersOnce } from "../legacyLocalReminders";

const FLAG_KEY = "tododo:legacyLocalRemindersCleared";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock("expo-notifications", () => ({
  cancelAllScheduledNotificationsAsync: jest.fn(),
}));

const getItem = jest.mocked(AsyncStorage.getItem);
const setItem = jest.mocked(AsyncStorage.setItem);
const cancelAll = jest.mocked(Notifications.cancelAllScheduledNotificationsAsync);

describe("cancelLegacyLocalRemindersOnce", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue(undefined);
    cancelAll.mockResolvedValue(undefined);
  });

  it("cancels once and records flag", async () => {
    await cancelLegacyLocalRemindersOnce();
    expect(cancelAll).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith(FLAG_KEY, "1");
  });

  it("skips when flag present", async () => {
    getItem.mockResolvedValue("1");
    await cancelLegacyLocalRemindersOnce();
    expect(cancelAll).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("does not record flag on failure", async () => {
    cancelAll.mockRejectedValue(new Error("boom"));
    await expect(cancelLegacyLocalRemindersOnce()).rejects.toThrow("boom");
    expect(setItem).not.toHaveBeenCalled();
  });
});
