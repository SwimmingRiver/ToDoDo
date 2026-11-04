import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  MAINTENANCE_INTERVAL_MS,
  readLastSuccess,
  shouldRunOnForeground,
  writeLastSuccess,
} from "../maintenanceSchedule";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const getItem = jest.mocked(AsyncStorage.getItem);
const setItem = jest.mocked(AsyncStorage.setItem);

const T0 = 1_700_000_000_000;
const MINUTE = 60 * 1000;

describe("shouldRunOnForeground", () => {
  it("실행 기록이 없으면 true다", () => {
    expect(shouldRunOnForeground(null, T0)).toBe(true);
  });

  it("24시간 중 1분이 모자라면(23시간 59분) false다", () => {
    expect(shouldRunOnForeground(T0, T0 + MAINTENANCE_INTERVAL_MS - MINUTE)).toBe(false);
  });

  it("정확히 24시간이 지났으면 true다", () => {
    expect(shouldRunOnForeground(T0, T0 + MAINTENANCE_INTERVAL_MS)).toBe(true);
  });

  it("간격 상수는 24시간(ms)이다", () => {
    expect(MAINTENANCE_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("readLastSuccess", () => {
  beforeEach(() => {
    getItem.mockReset();
    setItem.mockReset();
  });

  it("uid별로 분리된 키를 읽고 숫자로 변환한다", async () => {
    getItem.mockResolvedValue(String(T0));
    await expect(readLastSuccess("user-a")).resolves.toBe(T0);
    expect(getItem).toHaveBeenCalledWith("startupMaintenance:lastSuccess:user-a");
  });

  it("값이 없으면 null을 반환한다", async () => {
    getItem.mockResolvedValue(null);
    await expect(readLastSuccess("user-a")).resolves.toBeNull();
  });

  it("값이 숫자가 아니면 null을 반환한다", async () => {
    getItem.mockResolvedValue("not-a-number");
    await expect(readLastSuccess("user-a")).resolves.toBeNull();
  });

  it("저장소가 throw하면 null을 반환한다", async () => {
    getItem.mockRejectedValue(new Error("boom"));
    await expect(readLastSuccess("user-a")).resolves.toBeNull();
  });
});

describe("writeLastSuccess", () => {
  beforeEach(() => {
    getItem.mockReset();
    setItem.mockReset();
  });

  it("uid별 키에 ms를 문자열로 저장한다", async () => {
    setItem.mockResolvedValue(undefined);
    await writeLastSuccess("user-b", T0);
    expect(setItem).toHaveBeenCalledWith("startupMaintenance:lastSuccess:user-b", String(T0));
  });
});
