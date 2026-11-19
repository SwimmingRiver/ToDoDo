import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetJwksCache, verifyPubSubPushToken } from "../google/oidc";

const AUD = "https://billing.example/iap/google/notify";
const EMAIL = "pubsub@proj.iam.gserviceaccount.com";
const NOW = new Date("2026-11-19T00:00:00Z");
const nowSec = Math.floor(NOW.getTime() / 1000);

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

let pair: CryptoKeyPair;
let jwk: JsonWebKey & { kid: string };

beforeAll(async () => {
  pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" } as JsonWebKey & { kid: string };
});

beforeEach(() => resetJwksCache());

const goodClaims = () => ({
  iss: "https://accounts.google.com",
  aud: AUD,
  email: EMAIL,
  email_verified: true,
  exp: nowSec + 600,
});

const sign = async (claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: "k1" }) => {
  const input = `${enc(header)}.${enc(claims)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
};

const verify = async (header: string | null, fetchJwks = vi.fn().mockResolvedValue([jwk])) =>
  verifyPubSubPushToken(header, { audience: AUD, email: EMAIL, now: NOW, fetchJwks });

describe("verifyPubSubPushToken", () => {
  it("accepts valid RS256 token with matching aud/email/email_verified", async () => {
    expect(await verify(`Bearer ${await sign(goodClaims())}`)).toBe(true);
  });
  it("accepts iss without scheme", async () => {
    expect(await verify(`Bearer ${await sign({ ...goodClaims(), iss: "accounts.google.com" })}`)).toBe(true);
  });
  it("rejects wrong aud", async () => {
    expect(await verify(`Bearer ${await sign({ ...goodClaims(), aud: "https://evil" })}`)).toBe(false);
  });
  it("rejects wrong email", async () => {
    expect(await verify(`Bearer ${await sign({ ...goodClaims(), email: "x@y.com" })}`)).toBe(false);
  });
  it("rejects email_verified not true", async () => {
    expect(await verify(`Bearer ${await sign({ ...goodClaims(), email_verified: false })}`)).toBe(false);
  });
  it("rejects expired", async () => {
    expect(await verify(`Bearer ${await sign({ ...goodClaims(), exp: nowSec - 1 })}`)).toBe(false);
  });
  it("rejects iss other than accounts.google.com / https://accounts.google.com", async () => {
    expect(await verify(`Bearer ${await sign({ ...goodClaims(), iss: "https://evil.com" })}`)).toBe(false);
  });
  it("rejects tampered payload", async () => {
    const [h, , s] = (await sign(goodClaims())).split(".");
    expect(await verify(`Bearer ${h}.${enc({ ...goodClaims(), email: "x@y.com" })}.${s}`)).toBe(false);
  });
  it("rejects wrong alg or missing kid", async () => {
    expect(await verify(`Bearer ${await sign(goodClaims(), { alg: "HS256", kid: "k1" })}`)).toBe(false);
    expect(await verify(`Bearer ${await sign(goodClaims(), { alg: "RS256" })}`)).toBe(false);
  });
  it("missing or garbled header returns false without fetching", async () => {
    const f = vi.fn();
    expect(await verify(null, f)).toBe(false);
    expect(await verify("Basic abc", f)).toBe(false);
    expect(await verify("Bearer a.b", f)).toBe(false);
    expect(await verify("Bearer !!.@@.##", f)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it("unknown kid with empty cache fetches once then returns false", async () => {
    const f = vi.fn().mockResolvedValue([{ ...jwk, kid: "other" }]);
    expect(await verify(`Bearer ${await sign(goodClaims())}`, f)).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("kid miss within 60s of a refetch does not refetch again", async () => {
    const f = vi.fn().mockResolvedValue([{ ...jwk, kid: "other" }]);
    const token = `Bearer ${await sign(goodClaims())}`;
    expect(await verify(token, f)).toBe(false);
    expect(await verify(token, f)).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("kid miss after 60s refetches (key rotation)", async () => {
    await verify(`Bearer ${await sign(goodClaims())}`, vi.fn().mockResolvedValue([{ ...jwk, kid: "old" }]));
    const f = vi.fn().mockResolvedValue([jwk]);
    const later = new Date(NOW.getTime() + 61_000);
    const ok = await verifyPubSubPushToken(`Bearer ${await sign(goodClaims())}`, { audience: AUD, email: EMAIL, now: later, fetchJwks: f });
    expect(ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("JWKS fetch failure throws", async () => {
    const f = vi.fn().mockRejectedValue(new Error("down"));
    await expect(verify(`Bearer ${await sign(goodClaims())}`, f)).rejects.toThrow("down");
  });
});
