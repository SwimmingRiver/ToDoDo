import { describe, it, expect } from "vitest";
import { toFormValue, toRecurrenceRule } from "../recurrenceTransform";

describe("toRecurrenceRule", () => {
  it("daily 타입일 때 weekdays 키를 아예 포함하지 않는다", () => {
    const result = toRecurrenceRule({ type: "daily" }, null);
    expect(result).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(result, "weekdays")).toBe(false);
  });

  it("monthly 타입일 때도 weekdays 키를 포함하지 않는다", () => {
    const result = toRecurrenceRule({ type: "monthly" }, null);
    expect(Object.prototype.hasOwnProperty.call(result, "weekdays")).toBe(false);
  });

  it("weekly 타입일 때는 weekdays 배열을 그대로 포함한다", () => {
    const result = toRecurrenceRule({ type: "weekly", weekdays: [1, 3, 5] }, null);
    expect(result?.weekdays).toEqual([1, 3, 5]);
  });

  it("dueAt이 없으면 endType을 indefinite로, endDate를 null로 유도한다", () => {
    const result = toRecurrenceRule({ type: "daily" }, null);
    expect(result?.endType).toBe("indefinite");
    expect(result?.endDate).toBeNull();
  });

  it("dueAt이 있으면 endType을 untilDate로, endDate를 그 날짜(YYYY-MM-DD)로 유도한다", () => {
    const result = toRecurrenceRule({ type: "daily" }, "2026-07-10T18:00");
    expect(result?.endType).toBe("untilDate");
    expect(result?.endDate).toBe("2026-07-10");
  });

  it("value가 null이면 null을 반환한다", () => {
    expect(toRecurrenceRule(null, "2026-07-10T18:00")).toBeNull();
  });
});

describe("toFormValue", () => {
  it("recurrence가 null이면 null을 반환한다", () => {
    expect(toFormValue(null)).toBeNull();
  });

  it("endType/endDate는 폼 값에 포함하지 않는다 (파생값이라 폼 상태로 들지 않음)", () => {
    const result = toFormValue({ type: "daily", endType: "untilDate", endDate: "2026-07-10" });
    expect(result?.type).toBe("daily");
    expect(Object.prototype.hasOwnProperty.call(result, "endType")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, "endDate")).toBe(false);
  });
});
