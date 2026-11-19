import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { formatTodayLabel, formatDueTime } from "../formatToday";

describe("formatTodayLabel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("오늘 날짜면 '오늘'을 붙인다", () => {
    expect(formatTodayLabel("2026-06-15")).toBe("6월 15일, 오늘");
  });

  it("오늘이 아니면 요일명을 붙인다", () => {
    expect(formatTodayLabel("2026-06-16")).toBe("6월 16일, 화요일");
  });
});

describe("formatDueTime", () => {
  it("시각 정보가 자정(00:00)이면 null을 반환한다", () => {
    const midnightLocalIso = new Date(2026, 5, 15, 0, 0).toISOString();
    expect(formatDueTime(midnightLocalIso)).toBeNull();
  });

  it("오전 시각을 24시간제 HH:mm으로 포맷한다", () => {
    const iso = new Date(2026, 5, 15, 9, 0).toISOString();
    expect(formatDueTime(iso)).toBe("09:00");
  });

  it("오후 시각을 24시간제 HH:mm으로 포맷한다", () => {
    const iso = new Date(2026, 5, 15, 14, 0).toISOString();
    expect(formatDueTime(iso)).toBe("14:00");
  });

  it("정오와 분을 두 자리로 표시한다", () => {
    expect(formatDueTime(new Date(2026, 5, 15, 12, 0).toISOString())).toBe("12:00");
    expect(formatDueTime(new Date(2026, 5, 15, 18, 30).toISOString())).toBe("18:30");
    expect(formatDueTime(new Date(2026, 5, 15, 9, 5).toISOString())).toBe("09:05");
  });
});
