import { describe, it, expect } from "vitest";
import { toFormValue, toRecurrenceRule, DEFAULT_RECURRENCE_FORM_VALUE } from "../recurrenceForm";
import type { RecurrenceRule } from "../../types/todo";

describe("DEFAULT_RECURRENCE_FORM_VALUE", () => {
  it("새로 켤 때의 기본값은 매일 + 무기한", () => {
    expect(DEFAULT_RECURRENCE_FORM_VALUE).toEqual({ type: "daily", endType: "indefinite", endDate: null });
  });
});

describe("toRecurrenceRule", () => {
  it("daily 타입일 때 weekdays 키를 아예 포함하지 않는다", () => {
    const result = toRecurrenceRule({ type: "daily", endType: "untilDate", endDate: "2026-12-31" });
    expect(result).not.toBeNull();
    expect("weekdays" in (result as object)).toBe(false);
  });

  it("monthly 타입일 때도 weekdays 키를 포함하지 않는다", () => {
    const result = toRecurrenceRule({ type: "monthly", endType: "indefinite", endDate: null });
    expect("weekdays" in (result as object)).toBe(false);
  });

  it("weekly + untilDate는 weekdays와 종료일을 그대로 포함한다", () => {
    expect(
      toRecurrenceRule({ type: "weekly", weekdays: [1, 3], endType: "untilDate", endDate: "2026-12-31" }),
    ).toEqual({ type: "weekly", weekdays: [1, 3], endType: "untilDate", endDate: "2026-12-31" });
  });

  it("무기한이면 endDate를 버린다", () => {
    expect(
      toRecurrenceRule({ type: "daily", endType: "indefinite", endDate: "2026-12-31" }),
    ).toEqual({ type: "daily", endType: "indefinite", endDate: null });
  });

  it("value가 null이면 null을 반환한다", () => {
    expect(toRecurrenceRule(null)).toBeNull();
  });
});

describe("toFormValue", () => {
  it("recurrence가 null이면 null을 반환한다", () => {
    expect(toFormValue(null)).toBeNull();
    expect(toFormValue(undefined)).toBeNull();
  });

  it("종료 조건을 폼 값에 담는다", () => {
    expect(
      toFormValue({ type: "weekly", weekdays: [1], endType: "untilDate", endDate: "2026-12-31" }),
    ).toEqual({ type: "weekly", weekdays: [1], endType: "untilDate", endDate: "2026-12-31" });
  });

  it("무기한 규칙은 endDate를 null로 채운다", () => {
    expect(toFormValue({ type: "daily", endType: "indefinite" })).toEqual({
      type: "daily", endType: "indefinite", endDate: null,
    });
  });

  it("옛 문서: endType이 없으면 indefinite로 본다", () => {
    const old = { type: "daily" } as unknown as RecurrenceRule;
    expect(toFormValue(old)?.endType).toBe("indefinite");
    expect(toFormValue(old)?.endDate).toBeNull();
  });

  it("옛 문서: untilDate인데 endDate 형식이 다르면 endDate는 null (조용히 무기한으로 바꾸지 않음)", () => {
    const result = toFormValue({ type: "daily", endType: "untilDate", endDate: "2026-12-31T00:00:00.000Z" });
    expect(result?.endType).toBe("untilDate");
    expect(result?.endDate).toBeNull();
  });

  it("옛 문서: untilDate인데 endDate 키가 없으면 endDate는 null", () => {
    const result = toFormValue({ type: "daily", endType: "untilDate" });
    expect(result?.endType).toBe("untilDate");
    expect(result?.endDate).toBeNull();
  });
});

describe("toFormValue/toRecurrenceRule 왕복", () => {
  const rules: RecurrenceRule[] = [
    { type: "daily", endType: "indefinite", endDate: null },
    { type: "weekly", weekdays: [1, 4], endType: "untilDate", endDate: "2026-12-31" },
    { type: "monthly", endType: "untilDate", endDate: "2027-01-15" },
  ];
  it.each(rules)("%o", (rule) => {
    expect(toRecurrenceRule(toFormValue(rule))).toEqual(rule);
  });
});
