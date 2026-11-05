import { describe, it, expect } from "vitest";
import type { LegalRevision } from "../../config";
import { formatEffectiveOn, resolveLegalRevision, seoulDateKey } from "../resolveLegalRevision";

const base = { contactEmail: "a@b.c", privacyOfficer: "책임자" };

// 실제 시행일과 무관한 가상의 판 — 판정 로직만 검증한다.
const REVISIONS: LegalRevision[] = [
  { effectiveOn: "2030-03-01", change: "제정", config: { ...base, sellerName: "첫판" } },
  { effectiveOn: "2030-03-10", change: "판매자 변경", config: { ...base, sellerName: "둘째판" } },
];

describe("seoulDateKey", () => {
  it("실행 환경 시간대와 무관하게 서울 기준 날짜를 돌려준다", () => {
    // UTC 15:00 = 서울 다음 날 00:00
    expect(seoulDateKey(new Date("2030-03-09T14:59:59Z"))).toBe("2030-03-09");
    expect(seoulDateKey(new Date("2030-03-09T15:00:00Z"))).toBe("2030-03-10");
  });
});

describe("formatEffectiveOn", () => {
  it("YYYY-MM-DD를 한국어 날짜로 바꾼다(앞자리 0 없이)", () => {
    expect(formatEffectiveOn("2030-03-01")).toBe("2030년 3월 1일");
  });

  it("비어 있으면 빈 문자열(미정 표시는 fillLegalVariables가 맡는다)", () => {
    expect(formatEffectiveOn("")).toBe("");
  });
});

describe("resolveLegalRevision", () => {
  it("다음 판 시행 전에는 현재 판과 변경 예정 공지를 함께 돌려준다", () => {
    const result = resolveLegalRevision(REVISIONS, new Date("2030-03-09T14:59:59Z"));
    expect(result.current.sellerName).toBe("첫판");
    expect(result.current.effectiveDate).toBe("2030년 3월 1일");
    expect(result.upcoming).toEqual({ effectiveDate: "2030년 3월 10일", change: "판매자 변경" });
    expect(result.history).toEqual([{ effectiveDate: "2030년 3월 1일", change: "제정" }]);
  });

  it("서울 날짜로 시행일이 되면 새 판으로 바뀌고 공지는 사라진다", () => {
    const result = resolveLegalRevision(REVISIONS, new Date("2030-03-09T15:00:00Z"));
    expect(result.current.sellerName).toBe("둘째판");
    expect(result.current.effectiveDate).toBe("2030년 3월 10일");
    expect(result.upcoming).toBeUndefined();
    expect(result.history.map((h) => h.change)).toEqual(["제정", "판매자 변경"]);
  });

  it("첫 판 시행 전이라도 첫 판을 현재 판으로 보여준다", () => {
    const result = resolveLegalRevision(REVISIONS, new Date("2029-01-01T00:00:00Z"));
    expect(result.current.sellerName).toBe("첫판");
  });
});
