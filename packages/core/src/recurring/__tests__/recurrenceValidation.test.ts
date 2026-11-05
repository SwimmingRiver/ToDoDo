import { describe, it, expect } from "vitest";
import {
  getRecurrenceValidationError,
  WEEKDAY_REQUIRED_ERROR,
  END_DATE_REQUIRED_ERROR,
  END_DATE_BEFORE_START_ERROR,
} from "../recurrenceForm";
import type { RecurrenceFormValue } from "../recurrenceForm";

// 로컬 생성자로 만든다 (UTC 리터럴은 TZ에 따라 날짜가 밀린다)
const START = new Date(2026, 6, 10, 9, 0).toISOString();

describe("getRecurrenceValidationError", () => {
  const until = (endDate: string | null): RecurrenceFormValue => ({
    type: "daily", endType: "untilDate", endDate,
  });

  it("오류 문구", () => {
    expect(END_DATE_REQUIRED_ERROR).toBe("종료일을 선택해주세요");
    expect(END_DATE_BEFORE_START_ERROR).toBe("종료일은 시작일과 같거나 이후여야 합니다");
  });

  it("반복이 꺼져있으면 항상 유효하다", () => {
    expect(getRecurrenceValidationError(null, null)).toBeNull();
  });

  it("untilDate인데 endDate가 null이면 종료일 필수 오류", () => {
    expect(getRecurrenceValidationError(until(null), START)).toBe(END_DATE_REQUIRED_ERROR);
  });

  it("종료일이 시작일과 같은 날이면 유효", () => {
    expect(getRecurrenceValidationError(until("2026-07-10"), START)).toBeNull();
  });

  it("종료일이 시작일보다 하루 전이면 오류", () => {
    expect(getRecurrenceValidationError(until("2026-07-09"), START)).toBe(END_DATE_BEFORE_START_ERROR);
  });

  it("무기한이면 endDate를 무시한다", () => {
    expect(
      getRecurrenceValidationError({ type: "daily", endType: "indefinite", endDate: "2020-01-01" }, START),
    ).toBeNull();
  });

  it("weekly인데 요일이 없으면 종료 검사보다 먼저 요일 오류", () => {
    expect(
      getRecurrenceValidationError({ type: "weekly", weekdays: [], endType: "untilDate", endDate: null }, START),
    ).toBe(WEEKDAY_REQUIRED_ERROR);
  });

  it("weekly이고 요일이 있으면 유효", () => {
    expect(
      getRecurrenceValidationError({ type: "weekly", weekdays: [1], endType: "indefinite", endDate: null }, START),
    ).toBeNull();
  });

  it("startAt이 null이면 시작일 비교를 생략한다", () => {
    expect(getRecurrenceValidationError(until("2026-07-09"), null)).toBeNull();
  });
});
