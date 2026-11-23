import { describe, it, expect } from "vitest";
import { linkedNoticeKey, linkedNoticeStorageKey } from "../linkedNotice.js";

describe("linkedNoticeKey", () => {
  it("제공자가 2개 미만이면 null", () => {
    expect(linkedNoticeKey(["google.com"])).toBeNull();
    expect(linkedNoticeKey([])).toBeNull();
  });

  it("정렬해서 쉼표로 잇는다(순서 무관)", () => {
    expect(linkedNoticeKey(["google.com", "apple.com"])).toBe("apple.com,google.com");
    expect(linkedNoticeKey(["apple.com", "google.com"])).toBe("apple.com,google.com");
  });

  it("중복은 제거한다", () => {
    expect(linkedNoticeKey(["google.com", "google.com"])).toBeNull();
  });
});

describe("linkedNoticeStorageKey", () => {
  it("uid별 저장 키", () => {
    expect(linkedNoticeStorageKey("u1")).toBe("tododo:linkedNotice:u1");
  });
});
