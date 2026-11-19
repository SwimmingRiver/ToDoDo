import { describe, it, expect } from "vitest";
import { deriveAccountToken } from "../accountToken";

describe("deriveAccountToken", () => {
  it("is deterministic and UUID v4 shaped", async () => {
    const a = await deriveAccountToken("u1", "secret");
    expect(a).toBe(await deriveAccountToken("u1", "secret"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("differs by uid and by secret", async () => {
    expect(await deriveAccountToken("u1", "secret")).not.toBe(await deriveAccountToken("u2", "secret"));
    expect(await deriveAccountToken("u1", "secret")).not.toBe(await deriveAccountToken("u1", "other"));
  });

  it("throws on empty secret", async () => {
    await expect(deriveAccountToken("u1", "")).rejects.toThrow();
  });
});
