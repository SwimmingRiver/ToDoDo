import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "firebase/auth";
import { consumeLinkedNotice } from "../linkedNotice";

// 메모리 저장소처럼 동작하는 목
const store = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
const getItem = jest.mocked(AsyncStorage.getItem);
const setItem = jest.mocked(AsyncStorage.setItem);

const userWith = (...providerIds: string[]) =>
  ({ uid: "u1", providerData: providerIds.map((providerId) => ({ providerId })) }) as unknown as User;

describe("consumeLinkedNotice", () => {
  beforeEach(() => {
    store.clear();
    getItem.mockReset().mockImplementation(async (key: string) => store.get(key) ?? null);
    setItem.mockReset().mockImplementation(async (key: string, value: string) => {
      store.set(key, value);
    });
  });

  it("두 방법이 연결되면 처음 한 번만 true", async () => {
    const user = userWith("google.com", "apple.com");
    await expect(consumeLinkedNotice(user)).resolves.toBe(true);
    await expect(consumeLinkedNotice(user)).resolves.toBe(false);
  });

  it("방법이 하나뿐이면 false이고 기록하지 않는다", async () => {
    await expect(consumeLinkedNotice(userWith("apple.com"))).resolves.toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("저장소가 실패하면 false(로그인은 그대로)", async () => {
    getItem.mockRejectedValue(new Error("storage"));
    await expect(consumeLinkedNotice(userWith("google.com", "apple.com"))).resolves.toBe(false);
  });
});
