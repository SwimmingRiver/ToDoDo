import type { ReminderTodo } from "./schedule";

export type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, FirestoreValue> };
  arrayValue?: { values?: FirestoreValue[] };
};

interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
}

export class FirestoreError extends Error {
  constructor(readonly status: number, path: string) {
    super(`Firestore 요청 실패 (${status}): ${path}`);
    this.name = "FirestoreError";
  }
}

export const decodeValue = (value: FirestoreValue): unknown => {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) return decodeFields(value.mapValue?.fields ?? {});
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map(decodeValue);
  return undefined;
};

const decodeFields = (fields: Record<string, FirestoreValue>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));

export const toReminderTodo = (id: string, fields: Record<string, FirestoreValue>): ReminderTodo => {
  const data = decodeFields(fields);
  return {
    id,
    userId: String(data.userId ?? ""),
    title: String(data.title ?? ""),
    status: String(data.status ?? ""),
    archived: data.archived === true,
    dueAt: typeof data.dueAt === "string" ? data.dueAt : null,
    reminderOffsetMinutes: data.reminderOffsetMinutes,
  };
};

const docId = (name: string): string => name.slice(name.lastIndexOf("/") + 1);

const fieldFilter = (fieldPath: string, op: string, value: FirestoreValue) => ({
  fieldFilter: { field: { fieldPath }, op, value },
});

/**
 * 서비스 계정으로 Firestore REST를 호출한다. 서비스 계정은 보안 규칙을 우회하므로
 * 사용자 경계는 여기서 지킨다: 조회는 항상 userId로 거르고, 단건 조회는 userId를 확인한다.
 */
export class FirestoreClient {
  private readonly base: string;

  constructor(
    projectId: string,
    private readonly getToken: () => Promise<string>,
    // 전역 fetch를 그대로 기본값으로 담으면 this.fetchFn(...) 호출 시 this가 인스턴스가 되어
    // Workers가 "Illegal invocation"을 던진다. 감싸서 전역 fetch로 호출되게 한다.
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

  /** dueAt은 모든 작성 경로가 toISOString()(UTC Z) 형식이라 문자열 범위 비교가 시간 순서와 같다. */
  async queryUpcomingTodos(uid: string, fromIso: string, toIso: string): Promise<ReminderTodo[]> {
    const res = await this.request(":runQuery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "todos" }],
          where: {
            compositeFilter: {
              op: "AND",
              filters: [
                fieldFilter("userId", "EQUAL", { stringValue: uid }),
                fieldFilter("dueAt", "GREATER_THAN_OR_EQUAL", { stringValue: fromIso }),
                fieldFilter("dueAt", "LESS_THAN_OR_EQUAL", { stringValue: toIso }),
              ],
            },
          },
        },
      }),
    });
    if (!res.ok) throw new FirestoreError(res.status, ":runQuery");
    const rows = (await res.json()) as { document?: FirestoreDocument }[];
    return rows
      .filter((row): row is { document: FirestoreDocument } => !!row.document)
      .map(({ document }) => toReminderTodo(docId(document.name), document.fields ?? {}));
  }

  async getTodo(uid: string, todoId: string): Promise<ReminderTodo | null> {
    const path = `/todos/${encodeURIComponent(todoId)}`;
    const res = await this.request(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new FirestoreError(res.status, path);
    const document = (await res.json()) as FirestoreDocument;
    const todo = toReminderTodo(todoId, document.fields ?? {});
    return todo.userId === uid ? todo : null;
  }

  async getReminderDefault(uid: string): Promise<unknown> {
    const path = `/userSettings/${encodeURIComponent(uid)}`;
    const res = await this.request(path);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new FirestoreError(res.status, path);
    const document = (await res.json()) as FirestoreDocument;
    return decodeFields(document.fields ?? {}).reminderDefaultOffsetMinutes;
  }
}
