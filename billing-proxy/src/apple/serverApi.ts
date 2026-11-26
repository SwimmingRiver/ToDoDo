/**
 * App Store Server API 클라이언트: 거래 id로 구독의 "지금 상태 전체"를 조회해 AppleSnapshot으로 돌려준다.
 * 서명된 필드(JWS)는 주입받은 verify로 검증한 뒤에만 쓴다. 응답 본문을 그대로 믿지 않는다.
 */
import type { AppleRenewalInfo, AppleSnapshot, AppleTransaction } from "./decide";

export type StoreEnvironment = AppleTransaction["environment"];

const PROD_BASE = "https://api.storekit.itunes.apple.com";
const SANDBOX_BASE = "https://api.storekit-sandbox.itunes.apple.com";
/** Apple은 토큰 수명 60분 이하만 받는다. 만료 직전 경계를 피하려 발급은 50분 단위로 갱신하고 exp는 55분으로 둔다. */
const TOKEN_CACHE_MS = 50 * 60 * 1000;
const TOKEN_TTL_SEC = 55 * 60;

export interface AppleServerApiConfig {
  bundleId: string;
  issuerId: string;
  keyId: string;
  /** .p8 파일 내용(PKCS#8 PEM) */
  privateKeyPem: string;
}

const b64url = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const pemToDer = (pem: string): Uint8Array => {
  const base64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const requireField = (obj: Record<string, unknown>, key: string, type: "string" | "number", label: string): void => {
  if (typeof obj[key] !== type) throw new Error(`Apple ${label} 페이로드 형식 오류: ${key}`);
};

const optionalField = (obj: Record<string, unknown>, key: string, type: "string" | "number", label: string): void => {
  if (obj[key] !== undefined && typeof obj[key] !== type) throw new Error(`Apple ${label} 페이로드 형식 오류: ${key}`);
};

export const parseTransaction = (value: unknown): AppleTransaction => {
  if (!isRecord(value)) throw new Error("Apple 거래 페이로드 형식 오류");
  for (const key of ["originalTransactionId", "transactionId", "bundleId", "productId"]) {
    requireField(value, key, "string", "거래");
  }
  for (const key of ["purchaseDate", "originalPurchaseDate", "expiresDate"]) requireField(value, key, "number", "거래");
  if (value.environment !== "Production" && value.environment !== "Sandbox") {
    throw new Error("Apple 거래 페이로드 형식 오류: environment");
  }
  optionalField(value, "appAccountToken", "string", "거래");
  optionalField(value, "offerType", "number", "거래");
  optionalField(value, "offerDiscountType", "string", "거래");
  optionalField(value, "revocationDate", "number", "거래");
  return value as unknown as AppleTransaction;
};

const parseRenewal = (value: unknown): AppleRenewalInfo => {
  if (!isRecord(value)) throw new Error("Apple 갱신 정보 페이로드 형식 오류");
  if (value.autoRenewStatus !== 0 && value.autoRenewStatus !== 1) {
    throw new Error("Apple 갱신 정보 페이로드 형식 오류: autoRenewStatus");
  }
  optionalField(value, "gracePeriodExpiresDate", "number", "갱신 정보");
  return value as unknown as AppleRenewalInfo;
};

export class AppleServerApi {
  private cachedToken: { token: string; expiresAtMs: number } | null = null;
  private key: CryptoKey | null = null;

  constructor(
    private readonly cfg: AppleServerApiConfig,
    private readonly verify: (jws: string) => Promise<unknown>,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async token(): Promise<string> {
    const nowMs = this.now().getTime();
    if (this.cachedToken && nowMs < this.cachedToken.expiresAtMs) return this.cachedToken.token;

    this.key ??= await crypto.subtle.importKey(
      "pkcs8",
      pemToDer(this.cfg.privateKeyPem),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const iat = Math.floor(nowMs / 1000);
    const enc = new TextEncoder();
    const header = b64url(enc.encode(JSON.stringify({ alg: "ES256", kid: this.cfg.keyId, typ: "JWT" })));
    const payload = b64url(
      enc.encode(
        JSON.stringify({
          iss: this.cfg.issuerId,
          iat,
          exp: iat + TOKEN_TTL_SEC,
          aud: "appstoreconnect-v1",
          bid: this.cfg.bundleId,
        }),
      ),
    );
    // WebCrypto ECDSA 서명은 이미 JWS가 요구하는 raw r||s 형식이다(DER 변환 불필요).
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.key, enc.encode(`${header}.${payload}`));
    const token = `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
    this.cachedToken = { token, expiresAtMs: nowMs + TOKEN_CACHE_MS };
    return token;
  }

  /** 404면 null(없는 거래), 그 밖의 비정상 응답은 던진다(호출부가 재시도하도록). */
  private async fetchEnv(base: string, transactionId: string): Promise<unknown | null> {
    const res = await this.fetchFn(`${base}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${await this.token()}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`App Store Server API 오류: ${res.status}`);
    return res.json();
  }

  /**
   * 환불 요청(CONSUMPTION_REQUEST)에 이용 정보·환불 선호를 회신한다. 알림이 온 환경으로만 보낸다(폴백 없음).
   * 2xx가 아니면 던진다 — 호출부가 로그만 남기고 알림은 200으로 받는다.
   */
  async sendConsumptionInfo(transactionId: string, environment: StoreEnvironment, body: unknown): Promise<void> {
    const base = environment === "Sandbox" ? SANDBOX_BASE : PROD_BASE;
    const res = await this.fetchFn(`${base}/inApps/v2/transactions/consumption/${encodeURIComponent(transactionId)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${await this.token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`App Store Server API 환불 회신 오류: ${res.status}`);
  }

  /**
   * 거래에 서명된 environment의 API에만 묻는다. 운영→샌드박스 순서로 추측하지 않는다 — 출시 전 앱은 운영 API가
   * 샌드박스 거래에 404가 아니라 401을 돌려줘서(2026-11-26 TestFlight 실측) 폴백이 영영 일어나지 않았다.
   */
  async getSubscriptionSnapshot(transactionId: string, environment: StoreEnvironment): Promise<AppleSnapshot | null> {
    const body = await this.fetchEnv(environment === "Sandbox" ? SANDBOX_BASE : PROD_BASE, transactionId);
    if (body === null) return null;

    const entries: unknown[] = isRecord(body) && Array.isArray(body.data)
      ? body.data.flatMap((group) => (isRecord(group) && Array.isArray(group.lastTransactions) ? group.lastTransactions : []))
      : [];
    if (entries.length === 0) throw new Error("App Store Server API 응답에 구독 거래가 없음");

    // 요청한 id는 구독의 어떤 거래든 될 수 있으므로 originalTransactionId로 짝을 찾는다.
    const decoded: { status: unknown; transaction: AppleTransaction; entry: Record<string, unknown> }[] = [];
    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry.signedTransactionInfo !== "string") {
        throw new Error("App Store Server API 응답 형식 오류: signedTransactionInfo");
      }
      decoded.push({
        status: entry.status,
        transaction: parseTransaction(await this.verify(entry.signedTransactionInfo)),
        entry,
      });
    }
    // 항목이 하나면 그것, 여러 개면 요청 id가 거래 id 또는 원거래 id로 일치하는 항목. 못 고르면 추측하지 않고 던진다.
    const match =
      decoded.length === 1
        ? decoded[0]
        : decoded.find((d) => d.transaction.transactionId === transactionId || d.transaction.originalTransactionId === transactionId);
    if (!match) throw new Error("App Store Server API 응답에서 요청 거래의 구독을 특정할 수 없음");

    const status = match.status;
    if (status !== 1 && status !== 2 && status !== 3 && status !== 4 && status !== 5) {
      throw new Error("Apple 구독 status 형식 오류: status");
    }
    const signedRenewal = match.entry.signedRenewalInfo;
    const renewal = typeof signedRenewal === "string" ? parseRenewal(await this.verify(signedRenewal)) : null;
    return { status, transaction: match.transaction, renewal, notificationUUID: null, signedDate: null };
  }
}
