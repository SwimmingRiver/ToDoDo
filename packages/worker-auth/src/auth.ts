const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

export interface VerifiedToken {
  uid: string;
  /** premiumUntil > 검증 시각. 소비처(ai-proxy, calendar-proxy)는 이 값만 본다. */
  premium: boolean;
  /** 커스텀 클레임 premiumUntil(epoch 초). 없거나 숫자가 아니면 null. */
  premiumUntil: number | null;
}

interface JwksCache {
  keys: (JsonWebKey & { kid?: string })[];
  fetchedAt: number;
}

let cachedJwks: JwksCache | null = null;

const base64UrlDecode = (input: string): Uint8Array => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

const decodeJwtPart = (part: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));

const fetchJwks = async (): Promise<(JsonWebKey & { kid?: string })[]> => {
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  cachedJwks = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
};

const findJwk = async (kid: string): Promise<JsonWebKey> => {
  const isFresh = !!cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS;
  let keys = isFresh ? cachedJwks!.keys : await fetchJwks();
  let match = keys.find((k) => k.kid === kid);

  if (!match) {
    // 캐시가 신선해도 못 찾았다면 키가 최근에 로테이션됐을 수 있으니 한 번 더 강제 갱신
    keys = await fetchJwks();
    match = keys.find((k) => k.kid === kid);
  }

  if (!match) throw new Error("No matching key found");
  return match;
};

export const verifyFirebaseIdToken = async (
  idToken: string,
  firebaseProjectId: string,
): Promise<VerifiedToken> => {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed ID token");
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeJwtPart(headerB64) as { kid?: string; alg?: string };
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported token header");
  }

  const payload = decodeJwtPart(payloadB64) as {
    aud?: string;
    iss?: string;
    exp?: number;
    sub?: string;
    premiumUntil?: unknown;
  };

  if (payload.aud !== firebaseProjectId) throw new Error("Invalid audience");
  if (payload.iss !== `https://securetoken.google.com/${firebaseProjectId}`) {
    throw new Error("Invalid issuer");
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    throw new Error("Token expired");
  }
  if (!payload.sub) throw new Error("Missing subject");

  const jwk = await findJwk(header.kid);
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  let signature: Uint8Array;
  try {
    signature = base64UrlDecode(signatureB64);
  } catch {
    throw new Error("Invalid signature");
  }

  const isValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    signedData,
  );
  if (!isValid) throw new Error("Invalid signature");

  // 만료 시각만 비교하므로 체험 종료·해지 후 기간 만료 시 별도 회수 작업이 필요 없다.
  // 예전 형식(premium: true)은 의도적으로 무시한다 — 배포 직후 grant:entitlement로 재부여.
  const premiumUntil =
    typeof payload.premiumUntil === "number" && Number.isFinite(payload.premiumUntil)
      ? payload.premiumUntil
      : null;
  return {
    uid: payload.sub,
    premium: premiumUntil !== null && premiumUntil > Date.now() / 1000,
    premiumUntil,
  };
};
