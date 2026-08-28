import { describe, it, expect } from "@jest/globals";
import {
  toDateKey,
  parseLocalDateOnly,
  toDateKeyFromISO,
  isSameLocalDay,
  getStripDates,
  getDateKeysInRange,
  isDateInTodoRange,
  getPeriodProgress,
} from "../dateRange";

// 로컬 타임존 기준 특정 시각의 UTC ISO 문자열을 만든다. dueAt/startAt은 UTC Z
// 문자열로 저장되므로(toISOString), "yyyy-MM-ddT..Z"를 직접 하드코딩하면 실행
// 머신의 로컬 타임존에 따라 로컬 날짜가 하루 밀려 보일 수 있다.
const localISO = (y: number, m: number, d: number, h = 9): string =>
  new Date(y, m - 1, d, h).toISOString();

describe("toDateKey / parseLocalDateOnly 왕복", () => {
  it("Date와 yyyy-MM-dd 문자열이 서로 왕복 변환된다", () => {
    const key = "2026-06-15";
    expect(toDateKey(parseLocalDateOnly(key))).toBe(key);
  });
});

describe("toDateKeyFromISO", () => {
  it("UTC ISO 문자열을 로컬 날짜 키로 변환한다", () => {
    expect(toDateKeyFromISO(localISO(2026, 6, 15))).toBe("2026-06-15");
  });

  it("date-only(T 없음) 문자열은 그대로 반환한다", () => {
    expect(toDateKeyFromISO("2026-06-15")).toBe("2026-06-15");
  });
});

describe("isSameLocalDay", () => {
  it("같은 로컬 날짜면 true를 반환한다", () => {
    expect(isSameLocalDay(new Date(2026, 5, 15, 1), new Date(2026, 5, 15, 23))).toBe(true);
  });

  it("다른 날짜면 false를 반환한다", () => {
    expect(isSameLocalDay(new Date(2026, 5, 15), new Date(2026, 5, 16))).toBe(false);
  });
});

describe("getStripDates", () => {
  it("시작일부터 기본 7일의 연속 Date 배열을 반환한다", () => {
    const dates = getStripDates("2026-06-15");
    expect(dates).toHaveLength(7);
    expect(toDateKey(dates[0])).toBe("2026-06-15");
    expect(toDateKey(dates[6])).toBe("2026-06-21");
  });

  it("count를 넘기면 그 일수만큼 반환한다", () => {
    expect(getStripDates("2026-06-15", 3)).toHaveLength(3);
  });
});

describe("getDateKeysInRange", () => {
  it("시작~끝 날짜(양 끝 포함)의 yyyy-MM-dd 키 배열을 반환한다", () => {
    expect(getDateKeysInRange("2026-06-14", "2026-06-16")).toEqual([
      "2026-06-14",
      "2026-06-15",
      "2026-06-16",
    ]);
  });

  it("시작과 끝이 같으면 하루짜리 배열을 반환한다", () => {
    expect(getDateKeysInRange("2026-06-14", "2026-06-14")).toEqual(["2026-06-14"]);
  });
});

describe("isDateInTodoRange", () => {
  it("startAt/dueAt이 모두 없으면 false를 반환한다", () => {
    expect(isDateInTodoRange("2026-06-15", { startAt: null, dueAt: null })).toBe(false);
  });

  it("startAt만 있으면 startAt 날짜와 정확히 일치할 때만 true", () => {
    const todo = { startAt: localISO(2026, 6, 15), dueAt: null };
    expect(isDateInTodoRange("2026-06-15", todo)).toBe(true);
    expect(isDateInTodoRange("2026-06-16", todo)).toBe(false);
  });

  it("dueAt만 있으면 dueAt 날짜와 정확히 일치할 때만 true", () => {
    const todo = { startAt: null, dueAt: localISO(2026, 6, 15) };
    expect(isDateInTodoRange("2026-06-15", todo)).toBe(true);
    expect(isDateInTodoRange("2026-06-14", todo)).toBe(false);
  });

  it("startAt/dueAt이 모두 있으면 그 구간(양 끝 포함)에서 true", () => {
    const todo = { startAt: localISO(2026, 6, 14), dueAt: localISO(2026, 6, 16) };
    expect(isDateInTodoRange("2026-06-14", todo)).toBe(true);
    expect(isDateInTodoRange("2026-06-15", todo)).toBe(true);
    expect(isDateInTodoRange("2026-06-16", todo)).toBe(true);
    expect(isDateInTodoRange("2026-06-13", todo)).toBe(false);
    expect(isDateInTodoRange("2026-06-17", todo)).toBe(false);
  });

  it("date-only(T 없음) 문자열도 그대로 비교할 수 있다", () => {
    const todo = { startAt: "2026-06-14", dueAt: "2026-06-16" };
    expect(isDateInTodoRange("2026-06-15", todo)).toBe(true);
  });
});

describe("getPeriodProgress", () => {
  it("startAt이 없으면 null을 반환한다", () => {
    expect(getPeriodProgress("2026-06-15", { startAt: null, dueAt: localISO(2026, 6, 16) })).toBeNull();
  });

  it("dueAt이 없으면 null을 반환한다", () => {
    expect(getPeriodProgress("2026-06-15", { startAt: localISO(2026, 6, 14), dueAt: null })).toBeNull();
  });

  it("startAt/dueAt의 로컬 날짜가 같으면(단일 마감일 항목) null을 반환한다", () => {
    const todo = { startAt: localISO(2026, 6, 15, 9), dueAt: localISO(2026, 6, 15, 18) };
    expect(getPeriodProgress("2026-06-15", todo)).toBeNull();
  });

  it("기간 항목의 dayIndex/totalDays를 1부터 계산한다", () => {
    const todo = { startAt: localISO(2026, 6, 14), dueAt: localISO(2026, 6, 16) };
    expect(getPeriodProgress("2026-06-14", todo)).toEqual({ dayIndex: 1, totalDays: 3 });
    expect(getPeriodProgress("2026-06-15", todo)).toEqual({ dayIndex: 2, totalDays: 3 });
    expect(getPeriodProgress("2026-06-16", todo)).toEqual({ dayIndex: 3, totalDays: 3 });
  });
});
