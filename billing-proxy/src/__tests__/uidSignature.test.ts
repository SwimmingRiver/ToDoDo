import { describe, it, expect } from "vitest";
import { signUid, verifyUidSignature } from "../uidSignature";

const SECRET = "uid-secret";

describe("uidSignature", () => {
  it("uid의 hex HMAC-SHA256을 만든다(결정론적)", async () => {
    const sig = await signUid("u1", SECRET);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(await signUid("u1", SECRET)).toBe(sig);
    expect(await signUid("u2", SECRET)).not.toBe(sig);
  });

  it("시크릿이 비어 있으면 서명을 거부한다(설정 누락을 조용히 넘기지 않게)", async () => {
    await expect(signUid("u1", "")).rejects.toThrow("BILLING_UID_SECRET");
  });

  it("같은 시크릿으로 만든 서명이면 true", async () => {
    expect(await verifyUidSignature("u1", await signUid("u1", SECRET), SECRET)).toBe(true);
  });

  it("다른 uid·다른 시크릿·위조 서명이면 false", async () => {
    const sig = await signUid("u1", SECRET);
    expect(await verifyUidSignature("victim", sig, SECRET)).toBe(false);
    expect(await verifyUidSignature("u1", await signUid("u1", "other"), SECRET)).toBe(false);
    expect(await verifyUidSignature("u1", "0".repeat(64), SECRET)).toBe(false);
  });

  it("서명이 없거나 시크릿이 비어 있으면 false", async () => {
    expect(await verifyUidSignature("u1", null, SECRET)).toBe(false);
    expect(await verifyUidSignature("u1", "", SECRET)).toBe(false);
    expect(await verifyUidSignature("u1", await signUid("u1", SECRET), "")).toBe(false);
  });
});
