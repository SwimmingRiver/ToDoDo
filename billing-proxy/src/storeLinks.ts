import { fromFirestoreValue, toFirestoreValue, type FirestoreValue } from "./entitlementStore";

export type StoreKind = "apple" | "google";

/** 스토어 구독(영수증)이 어느 계정에 묶였는지. 한 영수증은 한 계정에만 붙는다. */
export interface StoreLink {
  uid: string;
  linkedAt: string;
  accountToken: string | null;
}

export type LinkDecision = { kind: "link" | "relink"; tokenMismatch: boolean } | { kind: "conflict" };

/**
 * 기존 연결과 요청 계정을 비교한다. 다른 계정에 이미 묶였으면 충돌,
 * 같은 계정이면 재연결, 없으면 새 연결. 토큰 불일치는 막지 않고 표시만 한다.
 */
export const decideLink = (
  existing: StoreLink | null,
  uid: string,
  expectedToken: string,
  receivedToken: string | null,
): LinkDecision => {
  if (existing && existing.uid !== uid) return { kind: "conflict" };
  return { kind: existing ? "relink" : "link", tokenMismatch: receivedToken !== expectedToken };
};

const sha256Hex = async (text: string): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

/** 문서 id. Google 토큰은 길고 `/`가 섞일 수 있어 해시로 쓴다(원본은 sources.google.purchaseToken). */
export const storeLinkId = async (store: StoreKind, id: string): Promise<string> =>
  store === "apple" ? `apple_${id}` : `google_${await sha256Hex(id)}`;

const PRECONDITION_FAILURES = new Set(["FAILED_PRECONDITION", "ALREADY_EXISTS", "NOT_FOUND", "ABORTED"]);

/** 서비스 계정으로 storeLinks/{id}를 읽고 쓴다. 쓰기는 항상 사전조건을 걸어 동시 연결 경합을 막는다. */
export class StoreLinkStore {
  private readonly base: string;

  constructor(
    projectId: string,
    private readonly getToken: () => Promise<string>,
    // 전역 fetch를 그대로 기본값으로 담으면 Workers가 "Illegal invocation"을 던진다.
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getToken();
    return this.fetchFn(`${this.base}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
  }

  async get(store: StoreKind, id: string): Promise<{ link: StoreLink | null; updateTime: string | null }> {
    const res = await this.request(`/storeLinks/${await storeLinkId(store, id)}`);
    if (res.status === 404) return { link: null, updateTime: null };
    if (!res.ok) throw new Error(`Firestore 스토어 연결 조회 실패 (${res.status})`);
    const body = (await res.json()) as { fields?: Record<string, FirestoreValue>; updateTime: string };
    const data = fromFirestoreValue({ mapValue: { fields: body.fields ?? {} } }) as Partial<StoreLink>;
    return {
      link: { uid: data.uid ?? "", linkedAt: data.linkedAt ?? "", accountToken: data.accountToken ?? null },
      updateTime: body.updateTime,
    };
  }

  async put(store: StoreKind, id: string, link: StoreLink, updateTime: string | null): Promise<"ok" | "conflict"> {
    const precondition =
      updateTime === null
        ? "currentDocument.exists=false"
        : `currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
    const res = await this.request(`/storeLinks/${await storeLinkId(store, id)}?${precondition}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreValue(link).mapValue?.fields }),
    });
    if (res.ok) return "ok";
    const body = (await res.json().catch(() => null)) as { error?: { status?: string } } | null;
    if (PRECONDITION_FAILURES.has(body?.error?.status ?? "")) return "conflict";
    throw new Error(`Firestore 스토어 연결 쓰기 실패 (${res.status})`);
  }
}
