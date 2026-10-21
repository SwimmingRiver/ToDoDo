import { describe, it, expect } from "@jest/globals";
import { formatRecurrenceSummary } from "../recurrenceSummary";

describe("formatRecurrenceSummary", () => {
  it("daily는 '매일 반복'", () => {
    expect(formatRecurrenceSummary({ type: "daily", endType: "indefinite" }, null)).toBe("매일 반복");
  });

  it("weekly는 요일을 일~토 순으로 정렬해 보여준다", () => {
    expect(
      formatRecurrenceSummary({ type: "weekly", weekdays: [5, 1, 3], endType: "indefinite" }, null),
    ).toBe("매주 월・수・금 반복");
  });

  it("weekly인데 요일이 없으면 '매주 반복'", () => {
    expect(formatRecurrenceSummary({ type: "weekly", weekdays: [], endType: "indefinite" }, null)).toBe(
      "매주 반복",
    );
  });

  it("monthly는 dueAt의 로컬 날짜(일)를 쓴다", () => {
    const dueAt = new Date(2026, 5, 10, 9, 0).toISOString();
    expect(formatRecurrenceSummary({ type: "monthly", endType: "indefinite" }, dueAt)).toBe("매월 10일 반복");
  });

  it("monthly인데 dueAt이 없으면 '매월 반복'", () => {
    expect(formatRecurrenceSummary({ type: "monthly", endType: "indefinite" }, null)).toBe("매월 반복");
  });
});
