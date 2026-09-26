import { describe, it, expect } from "vitest";
import { sanitizePlan, MAX_ITEMS, MAX_TITLE_LENGTH } from "../sanitizePlan";
import type { RawPlan } from "../planSchema";
import type { PlanRequest } from "../validateInput";

const req: PlanRequest = { goal: "이사 준비", dueDate: "2026-10-31", today: "2026-09-25" };
const item = (title: string, dueDate: string | null = "2026-10-03") =>
  ({ title, dueDate, priority: "medium" }) as const;
const raw = (overrides: Partial<RawPlan> = {}): RawPlan => ({
  title: "이사 준비",
  dueDate: "2026-10-31",
  items: [item("견적 받기")],
  ...overrides,
});

describe("sanitizePlan", () => {
  it("정상 응답은 그대로 통과한다", () => {
    expect(sanitizePlan(raw(), req)).toEqual({
      title: "이사 준비",
      dueDate: "2026-10-31",
      items: [{ title: "견적 받기", dueDate: "2026-10-03", priority: "medium" }],
    });
  });

  it(`하위 항목은 ${MAX_ITEMS}개까지만 남긴다`, () => {
    const items = Array.from({ length: 13 }, (_, i) => item(`단계 ${i + 1}`));
    const result = sanitizePlan(raw({ items }), req);
    expect(result?.items).toHaveLength(MAX_ITEMS);
    expect(result?.items[9].title).toBe("단계 10");
  });

  it("제목은 trim하고 빈 하위 항목은 버린다", () => {
    const result = sanitizePlan(raw({ items: [item("  견적  "), item("   ")] }), req);
    expect(result?.items.map((i) => i.title)).toEqual(["견적"]);
  });

  it(`제목은 ${MAX_TITLE_LENGTH}자로 자른다`, () => {
    const result = sanitizePlan(raw({ title: "가".repeat(150) }), req);
    expect(result?.title).toHaveLength(MAX_TITLE_LENGTH);
  });

  it("하위 항목이 전부 빈 제목이면 null(502 대상)", () => {
    expect(sanitizePlan(raw({ items: [item(" "), item("")] }), req)).toBeNull();
  });

  it("상위 제목이 비면 null", () => {
    expect(sanitizePlan(raw({ title: "  " }), req)).toBeNull();
  });

  it("하위 항목이 0개면 null", () => {
    expect(sanitizePlan(raw({ items: [] }), req)).toBeNull();
  });

  it("오늘 이전·마감 이후·형식 오류 날짜는 null로 비운다(항목은 유지)", () => {
    const result = sanitizePlan(
      raw({
        dueDate: "2026-11-30",
        items: [item("과거", "2026-09-24"), item("마감후", "2026-11-01"), item("이상", "10/03"), item("정상", "2026-09-25")],
      }),
      req,
    );
    expect(result?.dueDate).toBeNull();
    expect(result?.items.map((i) => i.dueDate)).toEqual([null, null, null, "2026-09-25"]);
  });

  it("요청 마감일이 없으면 오늘 이후 날짜는 모두 허용한다", () => {
    const result = sanitizePlan(raw({ items: [item("먼 미래", "2027-03-01")] }), { ...req, dueDate: null });
    expect(result?.items[0].dueDate).toBe("2027-03-01");
  });
});
