import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearSnapshot, loadSnapshot, saveSnapshot } from "../snapshotStorage";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const getItem = jest.mocked(AsyncStorage.getItem);
const setItem = jest.mocked(AsyncStorage.setItem);
const removeItem = jest.mocked(AsyncStorage.removeItem);

describe("snapshotStorage", () => {
  beforeEach(() => {
    getItem.mockReset();
    setItem.mockReset();
    removeItem.mockReset();
  });

  it("uid별 키로 저장하고 다시 읽는다", async () => {
    const snapshot = new Map([["t1", { updatedAt: "u1", googleEventId: "g1" }]]);
    setItem.mockResolvedValue(undefined);
    await saveSnapshot("uid-1", snapshot);
    expect(setItem).toHaveBeenCalledWith("calendarSyncSnapshot:uid-1", JSON.stringify([["t1", { updatedAt: "u1", googleEventId: "g1" }]]));
    getItem.mockResolvedValue(setItem.mock.calls[0][1] as string);
    await expect(loadSnapshot("uid-1")).resolves.toEqual(snapshot);
    expect(getItem).toHaveBeenCalledWith("calendarSyncSnapshot:uid-1");
  });

  it("값이 없으면 빈 Map", async () => {
    getItem.mockResolvedValue(null);
    await expect(loadSnapshot("uid-1")).resolves.toEqual(new Map());
  });

  it("AsyncStorage가 throw해도 load는 빈 Map, save/clear는 조용히 통과한다", async () => {
    getItem.mockRejectedValue(new Error("boom"));
    setItem.mockRejectedValue(new Error("boom"));
    removeItem.mockRejectedValue(new Error("boom"));
    await expect(loadSnapshot("uid-1")).resolves.toEqual(new Map());
    await expect(saveSnapshot("uid-1", new Map())).resolves.toBeUndefined();
    await expect(clearSnapshot("uid-1")).resolves.toBeUndefined();
  });

  it("clear는 uid별 키를 지운다", async () => {
    removeItem.mockResolvedValue(undefined);
    await clearSnapshot("uid-1");
    expect(removeItem).toHaveBeenCalledWith("calendarSyncSnapshot:uid-1");
  });
});
