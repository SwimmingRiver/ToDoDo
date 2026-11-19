import { normalizeEntitlement } from "@tododo/core/dist/entitlement/index.js";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "./entitlement";

export interface StoredEntitlement {
  doc: EntitlementDoc;
  /** 낙관적 동시성 제어용. null이면 문서가 아직 없다. */
  updateTime: string | null;
}

export interface FirestoreValue {
  stringValue?: string;
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

/** 평범한 JS 값을 Firestore REST 값으로. undefined 키는 null로 쓰지 않고 생략한다. */
export const toFirestoreValue = (value: unknown): FirestoreValue => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return { integerValue: String(Math.trunc(value)) };
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child !== undefined) fields[key] = toFirestoreValue(child);
  }
  return { mapValue: { fields } };
};

export const fromFirestoreValue = (value: FirestoreValue): unknown => {
  if (typeof value.stringValue === "string") return value.stringValue;
  if (typeof value.booleanValue === "boolean") return value.booleanValue;
  if (typeof value.integerValue === "string") return Number(value.integerValue);
  if (value.mapValue) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, child]) => [key, fromFirestoreValue(child)]),
    );
  }
  return null;
};

const PRECONDITION_FAILURES = new Set(["FAILED_PRECONDITION", "ALREADY_EXISTS", "NOT_FOUND", "ABORTED"]);

/**
 * 서비스 계정으로 entitlements/{uid}를 읽고 쓴다(보안 규칙 우회). 쓰기는 항상 사전조건을 걸어
 * 동시에 들어온 웹훅·체험 요청이 서로의 결과를 덮어쓰지 않게 한다.
 */
export class EntitlementStore {
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

  async get(uid: string): Promise<StoredEntitlement> {
    const res = await this.request(`/entitlements/${encodeURIComponent(uid)}`);
    if (res.status === 404) return { doc: EMPTY_ENTITLEMENT, updateTime: null };
    if (!res.ok) throw new Error(`Firestore 엔타이틀먼트 조회 실패 (${res.status})`);
    const body = (await res.json()) as { fields?: Record<string, FirestoreValue>; updateTime: string };
    return { doc: normalizeEntitlement(fromFirestoreValue({ mapValue: { fields: body.fields ?? {} } })), updateTime: body.updateTime };
  }

  async write(uid: string, doc: EntitlementDoc, updateTime: string | null): Promise<"ok" | "conflict"> {
    const precondition =
      updateTime === null
        ? "currentDocument.exists=false"
        : `currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
    const res = await this.request(`/entitlements/${encodeURIComponent(uid)}?${precondition}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFirestoreValue(doc).mapValue?.fields }),
    });
    if (res.ok) return "ok";
    const body = (await res.json().catch(() => null)) as { error?: { status?: string } } | null;
    if (PRECONDITION_FAILURES.has(body?.error?.status ?? "")) return "conflict";
    throw new Error(`Firestore 엔타이틀먼트 쓰기 실패 (${res.status})`);
  }
}
