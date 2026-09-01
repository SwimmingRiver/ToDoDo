import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyFirebaseIdToken } from "../auth";

const FIREBASE_PROJECT_ID = "tododo-test";

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const encodeJson = (obj: unknown): string =>
  base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));

async function makeSignedToken(
  payloadOverrides: Record<string, unknown> = {},
): Promise<{ token: string; jwk: JsonWebKey }> {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey & {
    kid?: string;
  };
  jwk.kid = crypto.randomUUID();

  const header = { alg: "RS256", kid: jwk.kid };
  const payload = {
    aud: FIREBASE_PROJECT_ID,
    iss: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    sub: "user-123",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payloadOverrides,
  };

  const headerB64 = encodeJson(header);
  const payloadB64 = encodeJson(payload);
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    signingInput,
  );
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return { token: `${headerB64}.${payloadB64}.${signatureB64}`, jwk };
}

const stubJwksFetch = (jwk: JsonWebKey) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [jwk] }),
    }),
  );
};

describe("verifyFirebaseIdToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("유효한 토큰이면 uid를 반환한다", async () => {
    const { token, jwk } = await makeSignedToken();
    stubJwksFetch(jwk);

    const result = await verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID);
    expect(result.uid).toBe("user-123");
  });

  it("audience가 다르면 에러를 던진다", async () => {
    const { token, jwk } = await makeSignedToken({ aud: "other-project" });
    stubJwksFetch(jwk);

    await expect(verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID)).rejects.toThrow(
      "Invalid audience",
    );
  });

  it("issuer가 다르면 에러를 던진다", async () => {
    const { token, jwk } = await makeSignedToken({
      iss: "https://securetoken.google.com/other-project",
    });
    stubJwksFetch(jwk);

    await expect(verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID)).rejects.toThrow(
      "Invalid issuer",
    );
  });

  it("만료된 토큰이면 에러를 던진다", async () => {
    const { token, jwk } = await makeSignedToken({
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    stubJwksFetch(jwk);

    await expect(verifyFirebaseIdToken(token, FIREBASE_PROJECT_ID)).rejects.toThrow(
      "Token expired",
    );
  });

  it("서명이 위조되면 에러를 던진다", async () => {
    const { token, jwk } = await makeSignedToken();
    const [header, payload] = token.split(".");
    const tamperedToken = `${header}.${payload}.tamperedsignaturevalue0000`;
    stubJwksFetch(jwk);

    await expect(verifyFirebaseIdToken(tamperedToken, FIREBASE_PROJECT_ID)).rejects.toThrow(
      "Invalid signature",
    );
  });

  it("형식이 잘못된 토큰이면 에러를 던진다", async () => {
    await expect(verifyFirebaseIdToken("not-a-jwt", FIREBASE_PROJECT_ID)).rejects.toThrow(
      "Malformed ID token",
    );
  });
});
