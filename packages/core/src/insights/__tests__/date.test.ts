import { describe, it, expect } from "vitest";
import {
  toDateKey,
  toDateKeyFromISO,
  parseDateKey,
  addDaysToKey,
  toMonthKey,
  addMonthsToMonthKey,
  diffDaysBetweenKeys,
} from "../date";

describe("insights/date", () => {
  it("toDateKey는 로컬 연/월/일을 0 패딩한 yyyy-MM-dd로 만든다", () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("toDateKeyFromISO는 T가 있으면 로컬 날짜로 변환하고, date-only면 그대로 반환한다", () => {
    const local = new Date(2026, 8, 14, 12);
    expect(toDateKeyFromISO(local.toISOString())).toBe("2026-09-14");
    expect(toDateKeyFromISO("2026-09-14")).toBe("2026-09-14");
  });

  it("parseDateKey는 로컬 자정 Date를 만든다", () => {
    const d = parseDateKey("2026-03-01");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 1, 0]);
  });

  it("addDaysToKey는 월/연 경계를 넘어 더하고 뺀다", () => {
    expect(addDaysToKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysToKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysToKey("2026-09-14", -89)).toBe("2026-06-17");
  });

  it("toMonthKey는 yyyy-MM만 남긴다", () => {
    expect(toMonthKey("2026-09-14")).toBe("2026-09");
  });

  it("addMonthsToMonthKey는 연 경계를 넘어 더한다", () => {
    expect(addMonthsToMonthKey("2026-11", 1)).toBe("2026-12");
    expect(addMonthsToMonthKey("2026-12", 1)).toBe("2027-01");
    expect(addMonthsToMonthKey("2026-01", -1)).toBe("2025-12");
  });

  it("diffDaysBetweenKeys는 달력 일수 차이를 정수로 돌려준다", () => {
    expect(diffDaysBetweenKeys("2026-09-01", "2026-09-14")).toBe(13);
    expect(diffDaysBetweenKeys("2026-09-14", "2026-09-01")).toBe(-13);
    // DST 전환이 있는 타임존에서도 23/25시간 하루를 1일로 센다
    expect(diffDaysBetweenKeys("2026-03-07", "2026-03-09")).toBe(2);
  });
});
