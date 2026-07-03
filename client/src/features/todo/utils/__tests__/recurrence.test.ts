import { describe, it, expect } from "vitest";
import {
  generateRecurringDueDates,
  getDefaultHorizonEnd,
  RECURRENCE_HORIZON_WEEKS,
} from "../recurrence";
import type { RecurrenceRule } from "../../types/todo.type";

// NOTE: 타임존에 따른 날짜 경계 이슈를 피하기 위해 모든 날짜/시각은 로컬 타임 문자열
// (Z suffix 없음, 예: "2026-07-10T18:00:00")로 표기한다. 이는 실제 dueAt 입력이
// datetime-local 인풋에서 오는 형태와도 일치한다.
const toDateKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

describe("generateRecurringDueDates", () => {
  it("daily: 매일 하나씩, baseDueAt부터 horizonEnd까지 생성한다", () => {
    const rule: RecurrenceRule = { type: "daily", endType: "indefinite" };
    const base = "2026-07-10T18:00:00";
    const horizonEnd = new Date("2026-07-15T00:00:00");

    const result = generateRecurringDueDates(base, rule, horizonEnd);

    expect(result.map(toDateKey)).toEqual([
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
    ]);
    // 모든 인스턴스는 baseDueAt과 동일한 시각(시:분)을 갖는다
    result.forEach((iso) => {
      const d = new Date(iso);
      expect(d.getHours()).toBe(new Date(base).getHours());
      expect(d.getMinutes()).toBe(new Date(base).getMinutes());
    });
  });

  it("weekly: rule.weekdays에 해당하는 요일마다 생성한다", () => {
    // 2026-07-10은 금요일(5). 월(1)/수(3)/금(5) 반복, baseDueAt의 요일도 포함되도록 구성
    const rule: RecurrenceRule = {
      type: "weekly",
      weekdays: [1, 3, 5],
      endType: "indefinite",
    };
    const base = "2026-07-10T09:00:00"; // 금요일
    const horizonEnd = new Date("2026-07-20T00:00:00");

    const result = generateRecurringDueDates(base, rule, horizonEnd);
    const keys = result.map(toDateKey);

    // 2026-07-10(금), 13(월), 15(수), 17(금), 20(월)
    expect(keys).toEqual([
      "2026-07-10",
      "2026-07-13",
      "2026-07-15",
      "2026-07-17",
      "2026-07-20",
    ]);
  });

  it("weekly: weekdays가 비어있으면 빈 배열을 반환한다", () => {
    const rule: RecurrenceRule = {
      type: "weekly",
      weekdays: [],
      endType: "indefinite",
    };
    const result = generateRecurringDueDates(
      "2026-07-10T09:00:00",
      rule,
      new Date("2026-07-20T00:00:00"),
    );
    expect(result).toEqual([]);
  });

  it("monthly: baseDueAt의 day를 유지해서 매월 생성한다", () => {
    const rule: RecurrenceRule = { type: "monthly", endType: "indefinite" };
    const base = "2026-07-10T18:00:00";
    const horizonEnd = new Date("2026-10-01T00:00:00");

    const result = generateRecurringDueDates(base, rule, horizonEnd);

    expect(result.map(toDateKey)).toEqual([
      "2026-07-10",
      "2026-08-10",
      "2026-09-10",
    ]);
  });

  it("monthly: 31일처럼 존재하지 않는 달은 그 달의 마지막 날로 클램핑한다 (2월 포함)", () => {
    const rule: RecurrenceRule = { type: "monthly", endType: "indefinite" };
    const base = "2026-01-31T09:00:00";
    const horizonEnd = new Date("2026-04-30T00:00:00");

    const result = generateRecurringDueDates(base, rule, horizonEnd);

    // 2026년은 평년 → 2월 마지막 날은 28일
    expect(result.map(toDateKey)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("endType이 untilDate이면 endDate와 horizonEnd 중 더 이른 날짜까지만 생성한다 (endDate가 더 이른 경우)", () => {
    const rule: RecurrenceRule = {
      type: "daily",
      endType: "untilDate",
      // endDate는 실제로는 <input type="date"> 값(시각 없는 "YYYY-MM-DD")으로 온다.
      endDate: "2026-07-12",
    };
    const base = "2026-07-10T18:00:00";
    const horizonEnd = new Date("2026-08-10T00:00:00"); // endDate보다 훨씬 뒤

    const result = generateRecurringDueDates(base, rule, horizonEnd);

    expect(result.map(toDateKey)).toEqual([
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ]);
  });

  it("endType이 untilDate여도 horizonEnd가 더 이르면 horizonEnd까지만 생성한다", () => {
    const rule: RecurrenceRule = {
      type: "daily",
      endType: "untilDate",
      endDate: "2026-12-31", // 훨씬 뒤 (date-only)
    };
    const base = "2026-07-10T18:00:00";
    const horizonEnd = new Date("2026-07-12T00:00:00");

    const result = generateRecurringDueDates(base, rule, horizonEnd);

    expect(result.map(toDateKey)).toEqual([
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ]);
  });

  it("무기한(indefinite)이면 horizonEnd까지 생성한다", () => {
    const rule: RecurrenceRule = { type: "daily", endType: "indefinite" };
    const base = "2026-07-10T18:00:00";
    const horizonEnd = new Date("2026-07-13T00:00:00");

    const result = generateRecurringDueDates(base, rule, horizonEnd);

    expect(result).toHaveLength(4);
    expect(toDateKey(result[result.length - 1])).toBe("2026-07-13");
  });

  // endDate는 <input type="date">에서 온 시각 없는 "YYYY-MM-DD" 문자열이다. 이를
  // new Date(str)로 바로 파싱하면 UTC 자정으로 해석되므로, UTC보다 시간이 느린
  // 타임존(예: America/New_York)에서는 로컬 날짜가 하루 당겨져 종료일 당일의
  // 인스턴스가 누락될 수 있다. 이 회귀를 잡기 위해 TZ를 명시적으로 바꿔서 검증한다.
  it("UTC보다 시간이 느린 타임존에서도 endDate 당일까지 정확히 생성한다", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      const rule: RecurrenceRule = {
        type: "daily",
        endType: "untilDate",
        endDate: "2026-07-12",
      };
      const base = "2026-07-10T18:00";
      const horizonEnd = new Date("2026-08-10T00:00:00");

      const result = generateRecurringDueDates(base, rule, horizonEnd);

      expect(result.map(toDateKey)).toEqual([
        "2026-07-10",
        "2026-07-11",
        "2026-07-12",
      ]);
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe("getDefaultHorizonEnd", () => {
  it(`기준일로부터 ${RECURRENCE_HORIZON_WEEKS}주 뒤 시점을 반환한다`, () => {
    const from = new Date("2026-07-03T00:00:00");
    const result = getDefaultHorizonEnd(from);
    const diffDays = Math.round(
      (result.getTime() - from.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(diffDays).toBe(RECURRENCE_HORIZON_WEEKS * 7);
  });
});
