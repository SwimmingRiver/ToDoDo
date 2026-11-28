import { describe, expect, it } from "@jest/globals";
import {
  formatWeekLabel,
  getWeekDateKeys,
  getWeekStartKey,
  monthForWeekToMonth,
  shiftWeekKey,
  toWeekRange,
  weekStartForMonthToWeek,
} from "../weekRange";

const isConsecutive = (keys: string[]) =>
  keys.every((key, i) => {
    if (i === 0) return true;
    const [y, m, d] = keys[i - 1].split("-").map(Number);
    const next = new Date(y, m - 1, d + 1);
    const expected = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    return key === expected;
  });

describe("getWeekStartKey", () => {
  it("그 날짜가 든 주의 일요일을 돌려준다", () => {
    expect(getWeekStartKey("2026-11-27")).toBe("2026-11-22");
    expect(getWeekStartKey("2026-11-22")).toBe("2026-11-22");
    expect(getWeekStartKey("2027-01-01")).toBe("2026-12-27");
  });
});

describe("getWeekDateKeys", () => {
  it("달이 바뀌는 주도 연속된 7일이다", () => {
    expect(getWeekDateKeys("2026-11-29")).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
    ]);
  });

  it.each(["2026-03-08", "2026-11-01"])("서머타임이 바뀌는 주(%s)도 중복·누락 없는 7일이다", (start) => {
    const keys = getWeekDateKeys(start);
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe(start);
    expect(isConsecutive(keys)).toBe(true);
  });
});

describe("shiftWeekKey", () => {
  it("해·달을 넘어 한 주씩 이동한다", () => {
    expect(shiftWeekKey("2026-12-27", 1)).toBe("2027-01-03");
    expect(shiftWeekKey("2026-11-01", -1)).toBe("2026-10-25");
  });
});

describe("toWeekRange", () => {
  it("로컬 일요일 0시 ~ 다음 일요일 0시", () => {
    const result = toWeekRange("2026-11-22");
    expect(result.range).toEqual({
      start: new Date(2026, 10, 22).toISOString(),
      end: new Date(2026, 10, 29).toISOString(),
    });
    expect(result.startKey).toBe("2026-11-22");
    expect(result.endKeyExclusive).toBe("2026-11-29");
  });
});

describe("formatWeekLabel", () => {
  const today = new Date(2026, 10, 28, 12);
  it("같은 달, 달이 걸침, 해가 걸침(올해 시작), 다른 해 시작", () => {
    expect(formatWeekLabel("2026-11-22", today)).toBe("11월 22일 – 28일");
    expect(formatWeekLabel("2026-11-29", today)).toBe("11월 29일 – 12월 5일");
    expect(formatWeekLabel("2026-12-27", today)).toBe("12월 27일 – 1월 2일");
    expect(formatWeekLabel("2027-03-07", today)).toBe("2027년 3월 7일 – 13일");
  });
});

describe("weekStartForMonthToWeek", () => {
  const today = new Date(2026, 10, 28, 12);
  it("보던 달 안의 선택 날짜가 든 주", () => {
    expect(
      weekStartForMonthToWeek({ selectedDate: "2026-11-10", visibleMonth: { year: 2026, month: 11 }, today }),
    ).toBe("2026-11-08");
  });
  it("보던 달 밖의 옛 선택은 무시하고, 이번 달이 아니면 그 달 1일이 든 주", () => {
    expect(
      weekStartForMonthToWeek({ selectedDate: "2026-10-15", visibleMonth: { year: 2026, month: 12 }, today }),
    ).toBe("2026-11-29");
  });
  it("선택이 없고 이번 달이면 이번 주", () => {
    expect(weekStartForMonthToWeek({ selectedDate: null, visibleMonth: { year: 2026, month: 11 }, today })).toBe(
      "2026-11-22",
    );
  });
});

describe("monthForWeekToMonth", () => {
  it("주의 일요일이 속한 달, 단 오늘이 든 주면 오늘의 달", () => {
    const today = new Date(2026, 10, 28, 12);
    expect(monthForWeekToMonth("2026-11-22", today)).toEqual({ year: 2026, month: 11 });
    expect(monthForWeekToMonth("2026-11-29", today)).toEqual({ year: 2026, month: 11 });
    expect(monthForWeekToMonth("2026-11-29", new Date(2026, 11, 2, 12))).toEqual({ year: 2026, month: 12 });
  });
});
