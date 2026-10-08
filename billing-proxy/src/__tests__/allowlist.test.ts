import { describe, it, expect } from "vitest";
import { isBillingAllowed } from "../allowlist";

describe("isBillingAllowed", () => {
  it("목록에 있는 uid만 허용한다(공백 무시)", () => {
    expect(isBillingAllowed("u1", "u0, u1 ,u2")).toBe(true);
    expect(isBillingAllowed("u3", "u0,u1")).toBe(false);
  });

  it("값이 없거나 비어 있으면 아무도 허용하지 않는다", () => {
    expect(isBillingAllowed("u1", undefined)).toBe(false);
    expect(isBillingAllowed("u1", "")).toBe(false);
    expect(isBillingAllowed("u1", " , ")).toBe(false);
  });

  it("정확히 *일 때만 전원 허용", () => {
    expect(isBillingAllowed("anyone", "*")).toBe(true);
    expect(isBillingAllowed("anyone", " * ")).toBe(true);
    expect(isBillingAllowed("anyone", "*,u1")).toBe(false);
  });
});
