import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { DUE_SOON_DAYS, getDaysLeft, getDueBadgeLabel, getDueLabel, getUrgency } from "../due";

// client/src/shared/utils/__tests__/due.test.ts의 핵심 케이스를 그대로 포팅.
describe("DUE_SOON_DAYS", () => {
  it("DUE_SOON_DAYS 상수는 3이어야 한다", () => {
    expect(DUE_SOON_DAYS).toBe(3);
  });
});

describe("getDueBadgeLabel", () => {
  it("daysLeft가 0이면 D-day를 반환한다", () => {
    expect(getDueBadgeLabel(0)).toBe("D-day");
  });

  it("daysLeft가 양수면 D-N을 반환한다", () => {
    expect(getDueBadgeLabel(1)).toBe("D-1");
    expect(getDueBadgeLabel(3)).toBe("D-3");
    expect(getDueBadgeLabel(7)).toBe("D-7");
  });

  it("daysLeft가 음수면 'N일 초과'를 반환한다", () => {
    expect(getDueBadgeLabel(-1)).toBe("1일 초과");
    expect(getDueBadgeLabel(-3)).toBe("3일 초과");
    expect(getDueBadgeLabel(-10)).toBe("10일 초과");
  });
});

describe("getDaysLeft", () => {
  it("오늘 자정 기준 미래 날짜는 양수를 반환한다", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const future = new Date(today);
    future.setDate(future.getDate() + 5);
    expect(getDaysLeft(future.toISOString())).toBe(5);
  });

  it("오늘 자정 기준 과거 날짜는 음수를 반환한다", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const past = new Date(today);
    past.setDate(past.getDate() - 2);
    expect(getDaysLeft(past.toISOString())).toBe(-2);
  });
});

describe("getUrgency", () => {
  it("daysLeft가 0 이하이면 danger를 반환한다", () => {
    expect(getUrgency(0)).toBe("danger");
    expect(getUrgency(-1)).toBe("danger");
  });

  it("daysLeft가 1~3이면 soon을 반환한다", () => {
    expect(getUrgency(1)).toBe("soon");
    expect(getUrgency(3)).toBe("soon");
  });

  it("daysLeft가 4 이상이면 normal을 반환한다", () => {
    expect(getUrgency(4)).toBe("normal");
    expect(getUrgency(10)).toBe("normal");
  });
});

describe("getDaysLeft (now 인자)", () => {
  it("now를 넘기면 그 시각의 로컬 날짜 기준으로 센다", () => {
    const dueAt = new Date(2026, 5, 16, 1, 0).toISOString();
    expect(getDaysLeft(dueAt, new Date(2026, 5, 15, 23, 59))).toBe(1);
  });
});

describe("getDueLabel", () => {
  const at = (d: number, h: number, mi = 0, s = 0) => new Date(2026, 5, d, h, mi, s).toISOString();
  let now: Date;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
    now = new Date();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("당일 마감 전이면 남은 시간을 시간·분 단위로 보여 준다", () => {
    expect(getDueLabel(at(15, 15), now)).toBe("3시간 남음");
    expect(getDueLabel(at(15, 12, 40), now)).toBe("40분 남음");
  });

  it("남은 분은 올림한다", () => {
    expect(getDueLabel(at(15, 12, 59, 59), now)).toBe("1시간 남음");
    expect(getDueLabel(at(15, 12, 0, 30), now)).toBe("1분 남음");
  });

  it("정확히 마감 순간은 1분 지남, 지난 시간은 내림한다", () => {
    expect(getDueLabel(at(15, 12, 0), now)).toBe("1분 지남");
    expect(getDueLabel(at(15, 11, 20), now)).toBe("40분 지남");
    expect(getDueLabel(at(15, 9, 30), now)).toBe("2시간 지남");
  });

  it("자정 마감은 시각 없이 D-day / D-n으로 보여 준다", () => {
    expect(getDueLabel(at(15, 0), now)).toBe("D-day");
    expect(getDueLabel(at(18, 0), now)).toBe("D-3");
  });

  it("1~3일 남으면 D-n에 시각을 붙이고, 지났으면 N일 초과만 보여 준다", () => {
    expect(getDueLabel(at(16, 14, 30), now)).toBe("D-1 · 14:30");
    expect(getDueLabel(at(13, 9), now)).toBe("2일 초과");
  });

  it("시간 단위는 당일에만 쓴다 (날짜 경계)", () => {
    expect(getDueLabel(at(16, 0, 30), new Date(2026, 5, 15, 23, 30))).toBe("D-1 · 00:30");
    expect(getDueLabel(at(14, 23), new Date(2026, 5, 15, 0, 10))).toBe("1일 초과");
  });
});
