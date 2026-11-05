import { describe, it, expect } from "vitest";
import { LEGAL_REVISIONS } from "../config";

describe("LEGAL_REVISIONS", () => {
  it("시행일은 YYYY-MM-DD 형식이고 판마다 엄격히 늦어진다", () => {
    for (const { effectiveOn } of LEGAL_REVISIONS) {
      expect(effectiveOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const dates = LEGAL_REVISIONS.map((r) => r.effectiveOn);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("모든 판의 판매자 표기·연락처·보호책임자가 채워져 있다", () => {
    for (const { config, change } of LEGAL_REVISIONS) {
      expect(config.sellerName.trim()).not.toBe("");
      expect(config.contactEmail.trim()).not.toBe("");
      expect(config.privacyOfficer.trim()).not.toBe("");
      expect(change.trim()).not.toBe("");
    }
  });
});
