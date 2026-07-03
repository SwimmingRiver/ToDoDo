import { describe, it, expect } from "vitest";
import { getRecurrenceValidationError } from "../recurrenceValidation";
import type { RecurrenceFormValue } from "../recurrenceFields.types";

// dueAt은 시각(HH:mm)을 포함한 datetime-local 문자열(예: 2026-07-01T18:00)이고,
// endDate는 <input type="date">에서 온 시각 없는 "YYYY-MM-DD" 문자열이다. 두 값을
// new Date()로 그대로 비교하면 date-only 문자열은 UTC 자정으로 해석되어, 같은
// 날짜인데도 시각 차이 때문에 "종료일이 마감일보다 이전"으로 잘못 판정될 수 있다.
describe("getRecurrenceValidationError - 종료일 vs 마감일 같은 날짜 비교", () => {
  const baseValue: RecurrenceFormValue = {
    type: "daily",
    endType: "untilDate",
    endDate: "2026-07-01",
  };

  it("마감일시와 종료일이 같은 날짜면 유효하다(에러 없음)", () => {
    const dueAt = "2026-07-01T18:00"; // datetime-local, 같은 날 저녁 시각
    const error = getRecurrenceValidationError(baseValue, dueAt);
    expect(error).toBeNull();
  });

  it("종료일이 마감일보다 실제로 하루 전이면 에러를 반환한다", () => {
    const value: RecurrenceFormValue = { ...baseValue, endDate: "2026-06-30" };
    const dueAt = "2026-07-01T18:00";
    const error = getRecurrenceValidationError(value, dueAt);
    expect(error).toBe("종료일은 마감일 이후여야 합니다");
  });

  it("종료일이 마감일보다 하루 뒤면 유효하다", () => {
    const value: RecurrenceFormValue = { ...baseValue, endDate: "2026-07-02" };
    const dueAt = "2026-07-01T18:00";
    const error = getRecurrenceValidationError(value, dueAt);
    expect(error).toBeNull();
  });
});
