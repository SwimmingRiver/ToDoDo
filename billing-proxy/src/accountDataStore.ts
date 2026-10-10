/** Firestore 커밋 한 번에 담을 수 있는 쓰기 상한. 조회도 같은 크기로 끊는다. */
const BATCH_LIMIT = 500;
/** 조회가 비지 않는 이상 상황에서 무한 반복하지 않게 둔 상한(500 × 200 = 10만 건). */
const MAX_ROUNDS = 200;
const SINGLE_DOC_COLLECTIONS = ["userSettings", "calendarIntegrations", "entitlements"] as const;

type QueryRow = { document?: { name: string } };

/**
 * 탈퇴 시 서비스 계정으로 사용자 데이터를 지운다(보안 규칙 우회 — entitlements·feedback은 클라이언트가 못 지운다).
 * 모든 단계가 멱등이라 중간에 실패해도 다시 부르면 이어서 끝난다.
 */
export class AccountDataStore {
  private readonly root: string;
  private readonly api: string;

  constructor(
    projectId: string,
    private readonly getToken: () => Promise<string>,
    // 전역 fetch를 그대로 기본값으로 담으면 Workers가 "Illegal invocation"을 던진다.
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.root = `projects/${projectId}/databases/(default)/documents`;
    this.api = `https://firestore.googleapis.com/v1/${this.root}`;
  }

  private async post(suffix: string, body: unknown): Promise<Response> {
    const token = await this.getToken();
    return this.fetchFn(`${this.api}${suffix}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  private async findOwnedDocNames(collectionId: string, uid: string): Promise<string[]> {
    const res = await this.post(":runQuery", {
      structuredQuery: {
        from: [{ collectionId }],
        where: { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: uid } } },
        select: { fields: [{ fieldPath: "__name__" }] },
        limit: BATCH_LIMIT,
      },
    });
    if (!res.ok) throw new Error(`Firestore ${collectionId} 조회 실패 (${res.status})`);
    const rows = (await res.json()) as QueryRow[];
    return rows.flatMap((row) => (row.document ? [row.document.name] : []));
  }

  private async commit(writes: unknown[]): Promise<void> {
    const res = await this.post(":commit", { writes });
    if (!res.ok) throw new Error(`Firestore 커밋 실패 (${res.status})`);
  }

  /** userId가 uid인 문서를 조회가 빌 때까지 BATCH_LIMIT씩 처리한다. 처리된 문서는 더 이상 조회되지 않아야 한다. */
  private async drain(collectionId: string, uid: string, toWrite: (name: string) => unknown): Promise<void> {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const names = await this.findOwnedDocNames(collectionId, uid);
      if (names.length === 0) return;
      await this.commit(names.map(toWrite));
    }
    throw new Error(`Firestore ${collectionId} 정리가 ${MAX_ROUNDS}회 안에 끝나지 않음`);
  }

  async deleteUserData(uid: string): Promise<void> {
    await this.drain("todos", uid, (name) => ({ delete: name }));
    // 피드백은 내용을 남기고 작성자 식별 정보만 지운다. updateMask에 있고 fields에 없는 필드는 삭제된다.
    await this.drain("feedback", uid, (name) => ({
      update: { name, fields: {} },
      updateMask: { fieldPaths: ["userId", "email"] },
    }));
    await this.commit(SINGLE_DOC_COLLECTIONS.map((collection) => ({ delete: `${this.root}/${collection}/${uid}` })));
  }
}
