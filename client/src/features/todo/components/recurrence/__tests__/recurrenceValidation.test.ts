import { describe, it, expect } from "vitest";
import { getRecurrenceValidationError } from "../recurrenceValidation";
import type { RecurrenceFormValue } from "../recurrenceFields.types";

describe("getRecurrenceValidationError", () => {
  const dailyValue: RecurrenceFormValue = { type: "daily" };

  it("반복이 꺼져있으면(value===null) 항상 유효하다", () => {
    expect(getRecurrenceValidationError(null, null, null)).toBeNull();
  });

  it("weekly인데 요일을 하나도 선택하지 않으면 에러를 반환한다", () => {
    const value: RecurrenceFormValue = { type: "weekly", weekdays: [] };
    expect(getRecurrenceValidationError(value, "2026-07-10T09:00", null)).toBe(
      "요일을 하나 이상 선택해주세요",
    );
  });

  it("weekly이고 요일이 하나 이상이면 유효하다", () => {
    const value: RecurrenceFormValue = { type: "weekly", weekdays: [1] };
    expect(getRecurrenceValidationError(value, "2026-07-10T09:00", null)).toBeNull();
  });

  it("dueAt이 없으면(무기한) startAt만으로 유효하다", () => {
    expect(getRecurrenceValidationError(dailyValue, "2026-07-10T09:00", null)).toBeNull();
  });

  it("마감일시와 시작일시가 같은 날짜면 유효하다(에러 없음)", () => {
    const startAt = "2026-07-10T09:00";
    const dueAt = "2026-07-10T18:00"; // 같은 날 저녁
    expect(getRecurrenceValidationError(dailyValue, startAt, dueAt)).toBeNull();
  });

  it("마감일이 시작일보다 실제로 하루 전이면 에러를 반환한다", () => {
    const startAt = "2026-07-10T09:00";
    const dueAt = "2026-07-09T18:00";
    expect(getRecurrenceValidationError(dailyValue, startAt, dueAt)).toBe(
      "마감일은 시작일과 같거나 이후여야 합니다",
    );
  });

  it("마감일이 시작일보다 하루 뒤면 유효하다", () => {
    const startAt = "2026-07-10T09:00";
    const dueAt = "2026-07-11T00:00";
    expect(getRecurrenceValidationError(dailyValue, startAt, dueAt)).toBeNull();
  });
});
