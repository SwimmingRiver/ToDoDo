import { describe, it, expect } from "@jest/globals";
import { DUE_SOON_DAYS, getDaysLeft, getDueBadgeLabel } from "../due";

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
