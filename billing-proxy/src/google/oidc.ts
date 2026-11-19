const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

type Jwk = JsonWebKey & { kid?: string };

export interface PubSubVerifyOptions {
  audience: string;
  email: string;
  now: Date;
  /** 테스트용 주입. 기본은 Google 공개키 조회. */
  fetchJwks?: () => Promise<JsonWebKey[]>;
}

let cache: { keys: Jwk[]; fetchedAt: number } | null = null;

/** 테스트에서 모듈 캐시를 비운다. */
export const resetJwksCache = (): void => {
  cache = null;
};

const defaultFetchJwks = async (): Promise<JsonWebKey[]> => {
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  return ((await res.json()) as { keys: JsonWebKey[] }).keys;
};

const base64UrlDecode = (input: string): Uint8Array => {
  const n = input.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(n.padEnd(n.length + ((4 - (n.length % 4)) % 4), "=")), (c) => c.charCodeAt(0));
};

const decodePart = (part: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
    return typeof v === "object" && v !== null ? v : null;
  } catch {
    return null;
  }
};

/** 키를 못 찾으면(로테이션 가능) 캐시가 신선해도 한 번 더 받아 본다. JWKS 조회 실패는 throw. */
const findJwk = async (kid: string, fetchJwks: () => Promise<JsonWebKey[]>, nowMs: number): Promise<Jwk | null> => {
  const refresh = async () => {
    cache = { keys: (await fetchJwks()) as Jwk[], fetchedAt: nowMs };
    return cache.keys;
  };
  const fresh = cache !== null && nowMs - cache.fetchedAt < JWKS_CACHE_TTL_MS;
  let match = (fresh ? cache!.keys : await refresh()).find((k) => k.kid === kid);
  if (!match) match = (await refresh()).find((k) => k.kid === kid);
  return match ?? null;
};

/**
 * Pub/Sub 푸시가 붙이는 Authorization: Bearer OIDC 토큰을 검증한다.
 * 잘못된 입력은 false. JWKS를 못 받은 경우만 throw(호출자가 500으로 응답해 재시도되게).
 */
export const verifyPubSubPushToken = async (
  authHeader: string | null,
  opts: PubSubVerifyOptions,
): Promise<boolean> => {
  const match = authHeader?.match(/^Bearer (.+)$/);
  if (!match) return false;
  const parts = match[1].split(".");
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodePart(headerB64);
  const payload = decodePart(payloadB64);
  if (!header || !payload) return false;
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) return false;

  if (typeof payload.iss !== "string" || !ISSUERS.includes(payload.iss)) return false;
  if (payload.aud !== opts.audience) return false;
  if (payload.email !== opts.email) return false;
  if (payload.email_verified !== true) return false;
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= opts.now.getTime()) return false;

  const jwk = await findJwk(header.kid, opts.fetchJwks ?? defaultFetchJwks, opts.now.getTime());
  if (!jwk) return false;

  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlDecode(signatureB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
  } catch {
    return false;
  }
};
