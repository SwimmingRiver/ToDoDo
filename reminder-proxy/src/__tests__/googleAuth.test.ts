import { describe, it, expect, vi, beforeAll } from "vitest";
import {
  GOOGLE_SCOPES,
  GoogleTokenProvider,
  parseServiceAccount,
  signServiceAccountJwt,
  type ServiceAccount,
} from "../googleAuth";

let sa: ServiceAccount;
let publicKey: CryptoKey;

const toPem = (der: ArrayBuffer) => {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
};
const b64urlDecode = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) =>
    c.charCodeAt(0),
  );

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  publicKey = pair.publicKey;
  sa = {
    client_email: "reminder@tododo-test.iam.gserviceaccount.com",
    private_key: toPem((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer),
  };
});

describe("parseServiceAccount", () => {
  it("client_email과 private_key를 꺼낸다", () => {
    expect(parseServiceAccount(JSON.stringify({ ...sa, project_id: "x" }))).toEqual(sa);
  });

  it("필드가 없으면 throw", () => {
    expect(() => parseServiceAccount("{}")).toThrow();
    expect(() => parseServiceAccount("not json")).toThrow();
  });
});

describe("signServiceAccountJwt", () => {
  it("RS256으로 서명된 올바른 클레임의 JWT를 만든다", async () => {
    const jwt = await signServiceAccountJwt(sa, 1_000);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(p)))).toEqual({
      iss: sa.client_email,
      scope: GOOGLE_SCOPES,
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_000,
      exp: 4_600,
    });
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      b64urlDecode(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(valid).toBe(true);
  });
});

describe("GoogleTokenProvider", () => {
  const okResponse = (token: string) =>
    new Response(JSON.stringify({ access_token: token, expires_in: 3600 }), { status: 200 });

  it("토큰을 교환하고 만료 5분 전까지 캐시한다", async () => {
    let now = 0;
    const fetchFn = vi.fn().mockResolvedValueOnce(okResponse("a")).mockResolvedValueOnce(okResponse("b"));
    const provider = new GoogleTokenProvider(sa, fetchFn as unknown as typeof fetch, () => now);

    expect(await provider.getToken()).toBe("a");
    now = 54 * 60_000;
    expect(await provider.getToken()).toBe("a");
    expect(fetchFn).toHaveBeenCalledTimes(1);

    now = 56 * 60_000;
    expect(await provider.getToken()).toBe("b");
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(body.get("assertion")?.split(".")).toHaveLength(3);
  });

  it("교환 실패면 throw하고 캐시하지 않는다", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response("no", { status: 400 })).mockResolvedValueOnce(okResponse("c"));
    const provider = new GoogleTokenProvider(sa, fetchFn as unknown as typeof fetch, () => 0);
    await expect(provider.getToken()).rejects.toThrow("400");
    expect(await provider.getToken()).toBe("c");
  });
});
