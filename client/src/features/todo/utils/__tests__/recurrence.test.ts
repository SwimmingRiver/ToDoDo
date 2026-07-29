import { describe, it, expect, vi } from "vitest";
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

  it("monthly: 윤년에는 2월 29일까지 클램핑한다 (평년 28일과 구분)", () => {
    const rule: RecurrenceRule = { type: "monthly", endType: "indefinite" };
    const base = "2028-01-31T09:00:00"; // 2028년은 윤년 → 2월은 29일까지 존재
    const horizonEnd = new Date("2028-04-30T00:00:00");

    const result = generateRecurringDueDates(base, rule, horizonEnd);

    expect(result.map(toDateKey)).toEqual([
      "2028-01-31",
      "2028-02-29", // 평년이었다면 28일로 클램핑되었을 자리
      "2028-03-31",
      "2028-04-30",
    ]);
  });

  it("monthly: 윤년 2월 29일 기준으로 반복하면 이듬해(평년) 2월은 28일로 클램핑된다", () => {
    const rule: RecurrenceRule = { type: "monthly", endType: "indefinite" };
    const base = "2028-02-29T09:00:00"; // 2028년 윤년의 2월 29일
    const horizonEnd = new Date("2029-02-28T23:59:59");

    const result = generateRecurringDueDates(base, rule, horizonEnd);
    const keys = result.map(toDateKey);

    // 2028-02(29일) ~ 2029-02(평년, 28일로 클램핑)까지 매월 하나씩 총 13건
    expect(keys).toHaveLength(13);
    expect(keys[0]).toBe("2028-02-29");
    expect(keys[keys.length - 1]).toBe("2029-02-28");
  });

  it("daily: horizonEnd 당일이면 시각과 무관하게 그 날의 인스턴스까지 포함한다 (등호 경계)", () => {
    const rule: RecurrenceRule = { type: "daily", endType: "indefinite" };
    const base = "2026-07-10T18:00:00";
    // horizonEnd가 그 날의 이른 시각이어도 그 날 전체(23:59:59.999)로 확장되어 포함되어야 한다.
    const horizonEnd = new Date("2026-07-12T00:00:01");

    const result = generateRecurringDueDates(base, rule, horizonEnd);

    expect(result.map(toDateKey)).toEqual([
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ]);
  });

  it("daily: horizonEnd가 하루 전 23:59:59.999(자정 1ms 전)이면 다음날 인스턴스는 제외된다 (off-by-one 경계)", () => {
    const rule: RecurrenceRule = { type: "daily", endType: "indefinite" };
    const base = "2026-07-10T18:00:00";
    const horizonEnd = new Date("2026-07-11T23:59:59.999");

    const result = generateRecurringDueDates(base, rule, horizonEnd);

    expect(result.map(toDateKey)).toEqual(["2026-07-10", "2026-07-11"]);
  });

  it("monthly: horizonEnd가 클램핑된 말일과 정확히 같으면 포함된다 (등호 경계)", () => {
    const rule: RecurrenceRule = { type: "monthly", endType: "indefinite" };
    const base = "2026-01-31T09:00:00";
    const horizonEnd = new Date("2026-02-28T00:00:00"); // 2026년은 평년 → 2월 마지막 날은 28일

    const result = generateRecurringDueDates(base, rule, horizonEnd);

    expect(result.map(toDateKey)).toEqual(["2026-01-31", "2026-02-28"]);
  });

  it("monthly: horizonEnd가 클램핑된 말일 하루 전이면 그 달의 인스턴스는 제외된다 (off-by-one 경계)", () => {
    const rule: RecurrenceRule = { type: "monthly", endType: "indefinite" };
    const base = "2026-01-31T09:00:00";
    const horizonEnd = new Date("2026-02-27T00:00:00"); // 2월 마지막 날(28일) 하루 전까지만 허용

    const result = generateRecurringDueDates(base, rule, horizonEnd);

    expect(result.map(toDateKey)).toEqual(["2026-01-31"]);
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

  // monthly 말일 클램핑과 horizonEnd 경계 비교는 모두 로컬 Date getter/setter(getDate,
  // new Date(y, m, d) 등)로만 계산되지만, CI가 UTC라 타임존 버그가 있어도 통과해버릴 수
  // 있다. UTC보다 느린 타임존에서도 윤년 클램핑과 등호 경계가 동일하게 성립하는지 확인한다.
  it("UTC보다 시간이 느린 타임존에서도 윤년 2월 29일 클램핑과 horizonEnd 등호 경계가 유지된다", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      const rule: RecurrenceRule = { type: "monthly", endType: "indefinite" };
      const base = "2028-01-31T09:00:00";
      const horizonEnd = new Date("2028-02-29T00:00:00"); // 클램핑된 말일과 정확히 같은 날

      const result = generateRecurringDueDates(base, rule, horizonEnd);

      expect(result.map(toDateKey)).toEqual(["2028-01-31", "2028-02-29"]);
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

  // from을 생략하면 내부에서 new Date()(현재 시스템 시각)를 기준으로 삼는다. 이 기본값
  // 경로는 시스템 시간을 고정하지 않으면 검증할 수 없으므로 fake timer로 "오늘"을 고정한다.
  it("from을 생략하면 현재 시스템 시각 기준 4주 뒤를 반환한다", () => {
    const anchor = new Date("2026-07-03T10:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(anchor);
    try {
      const result = getDefaultHorizonEnd();
      const diffDays = Math.round(
        (result.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(diffDays).toBe(RECURRENCE_HORIZON_WEEKS * 7);
    } finally {
      vi.useRealTimers();
    }
  });
});
