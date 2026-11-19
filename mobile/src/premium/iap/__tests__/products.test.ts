import { describe, it, expect } from "@jest/globals";
import { pickGoogleOffer } from "../products";

const offers = [
  { id: "monthly", basePlanIdAndroid: "monthly", offerTokenAndroid: "tok-base" },
  { id: "free-trial-7d", basePlanIdAndroid: "monthly", offerTokenAndroid: "tok-trial" },
  { id: "yearly", basePlanIdAndroid: "yearly", offerTokenAndroid: "tok-yearly" },
];

describe("pickGoogleOffer", () => {
  it("체험이면 monthly 기본 요금제의 free-trial-7d offer 토큰", () => {
    expect(pickGoogleOffer(offers, true)).toBe("tok-trial");
  });

  it("체험이 아니면 monthly 기본 요금제 자체(offer 없는 것)의 토큰", () => {
    expect(pickGoogleOffer(offers, false)).toBe("tok-base");
  });

  it("체험 offer가 없으면(자격 없음) null", () => {
    expect(pickGoogleOffer(offers.filter((o) => o.id !== "free-trial-7d"), true)).toBeNull();
  });
});
