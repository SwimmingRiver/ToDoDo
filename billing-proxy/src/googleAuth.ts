/**
 * reminder-proxy/src/googleAuth.ts의 복제본. 스코프만 다르다(Firestore 쓰기 + Identity Toolkit).
 * 두 곳을 공유 패키지로 합치는 것은 세 번째 사용처가 생길 때 한다.
 */
export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
// cloud-platform은 Firestore와 Identity Toolkit(커스텀 클레임) 둘 다 포함한다.
export const GOOGLE_SCOPES = "https://www.googleapis.com/auth/cloud-platform";
/** 만료 이 시간 전부터는 새 토큰을 받는다(발송 도중 만료 방지). */
const REFRESH_MARGIN_MS = 5 * 60_000;

export const parseServiceAccount = (json: string): ServiceAccount => {
  const data = JSON.parse(json) as Partial<ServiceAccount>;
  if (typeof data.client_email !== "string" || typeof data.private_key !== "string") {
    throw new Error("GOOGLE_SERVICE_ACCOUNT에 client_email/private_key가 없습니다");
  }
  return { client_email: data.client_email, private_key: data.private_key };
};

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const encodeJson = (value: unknown): string => base64Url(new TextEncoder().encode(JSON.stringify(value)));

const pemToDer = (pem: string): Uint8Array => {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

export const signServiceAccountJwt = async (sa: ServiceAccount, nowSec: number): Promise<string> => {
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({
    iss: sa.client_email,
    scope: GOOGLE_SCOPES,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + 3600,
  });
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
};

/** DO 인스턴스 메모리에 액세스 토큰을 캐시한다. DO가 퇴거되면 다음 알람에서 다시 받는다. */
export class GoogleTokenProvider {
  private cached: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly sa: ServiceAccount,
    // 전역 fetch를 그대로 기본값으로 담으면 this.fetchFn(...) 호출 시 this가 인스턴스가 되어
    // Workers가 "Illegal invocation"을 던진다. 감싸서 전역 fetch로 호출되게 한다.
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
    private readonly now: () => number = Date.now,
  ) {}

  async getToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - REFRESH_MARGIN_MS > this.now()) {
      return this.cached.token;
    }
    const assertion = await signServiceAccountJwt(this.sa, Math.floor(this.now() / 1000));
    const res = await this.fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
    if (!res.ok) throw new Error(`Google 토큰 교환 실패: ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.cached = { token: data.access_token, expiresAt: this.now() + data.expires_in * 1000 };
    return data.access_token;
  }
}
