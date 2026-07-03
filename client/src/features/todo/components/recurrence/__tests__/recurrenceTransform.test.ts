import { describe, it, expect } from "vitest";
import { toRecurrenceRule } from "../recurrenceTransform";

// Firestore는 undefined 값을 가진 필드(중첩 객체 내부 포함)를 거부하고 즉시 에러를 던진다.
// weekdays는 optional 필드이므로 "값이 없다"는 것은 undefined 대입이 아니라
// 키 자체가 존재하지 않는 것으로 표현되어야 한다.
describe("toRecurrenceRule", () => {
  it("daily 타입일 때 weekdays 키를 아예 포함하지 않는다", () => {
    const result = toRecurrenceRule({ type: "daily", endType: "indefinite" });
    expect(result).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(result, "weekdays")).toBe(false);
  });

  it("monthly 타입일 때도 weekdays 키를 포함하지 않는다", () => {
    const result = toRecurrenceRule({ type: "monthly", endType: "indefinite" });
    expect(Object.prototype.hasOwnProperty.call(result, "weekdays")).toBe(false);
  });

  it("weekly 타입일 때는 weekdays 배열을 그대로 포함한다", () => {
    const result = toRecurrenceRule({
      type: "weekly",
      weekdays: [1, 3, 5],
      endType: "indefinite",
    });
    expect(result?.weekdays).toEqual([1, 3, 5]);
  });
});
