import { describe, it, expect } from "vitest";
import { fillLegalVariables } from "../fillLegalVariables";
import type { LegalConfig } from "../../config";

const EMPTY: LegalConfig = { sellerName: "", contactEmail: "", effectiveDate: "", privacyOfficer: "" };

describe("fillLegalVariables", () => {
  it("값이 있으면 토큰을 그 값으로 바꾼다", () => {
    const config = { ...EMPTY, sellerName: "홍길동", contactEmail: "a@b.com" };
    expect(fillLegalVariables("운영자 {{sellerName}}, 문의 {{contactEmail}}", config)).toBe(
      "운영자 홍길동, 문의 a@b.com",
    );
  });

  it("빈 값은 항목별 미정 표시로 바꾼다", () => {
    expect(
      fillLegalVariables("{{sellerName}}/{{contactEmail}}/{{effectiveDate}}/{{privacyOfficer}}", EMPTY),
    ).toBe("[판매자명 미정]/[연락처 미정]/[시행일 미정]/[보호책임자 미정]");
  });

  it("공백만 있는 값도 미정으로 취급한다", () => {
    expect(fillLegalVariables("{{sellerName}}", { ...EMPTY, sellerName: "   " })).toBe("[판매자명 미정]");
  });

  it("일부만 채워도 나머지는 미정으로 남는다", () => {
    const config = { ...EMPTY, sellerName: "홍길동" };
    expect(fillLegalVariables("{{sellerName}} {{privacyOfficer}}", config)).toBe("홍길동 [보호책임자 미정]");
  });

  it("정의되지 않은 토큰은 그대로 둔다(콘텐츠 테스트가 잡도록)", () => {
    expect(fillLegalVariables("{{unknown}}", EMPTY)).toBe("{{unknown}}");
  });
});
