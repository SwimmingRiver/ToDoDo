import { describe, it, expect, vi } from "vitest";
import { AccountDataStore } from "../accountDataStore";

const ROOT = "projects/p1/databases/(default)/documents";
const API = `https://firestore.googleapis.com/v1/${ROOT}`;

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const rows = (collection: string, ids: string[]) =>
  ids.length === 0 ? [{ readTime: "t" }] : ids.map((id) => ({ document: { name: `${ROOT}/${collection}/${id}` }, readTime: "t" }));

/**
 * runQuery는 컬렉션별로 준비한 응답 묶음을 차례로 돌려주고, commit은 받은 writes를 기록한다.
 */
const fakeFirestore = (queryPages: Record<string, unknown[][]>) => {
  const commits: unknown[][] = [];
  const queries: { collectionId: string; limit: number }[] = [];
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    if (url === `${API}:runQuery`) {
      const { from, where, limit } = body.structuredQuery;
      expect(where).toEqual({ fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: "u1" } } });
      queries.push({ collectionId: from[0].collectionId, limit });
      return jsonRes(queryPages[from[0].collectionId].shift() ?? rows(from[0].collectionId, []));
    }
    if (url === `${API}:commit`) {
      commits.push(body.writes);
      return jsonRes({ writeResults: [] });
    }
    throw new Error(`예상 밖 URL ${url}`);
  });
  return { fetchFn, commits, queries };
};

const store = (fetchFn: typeof fetch) => new AccountDataStore("p1", async () => "tok", fetchFn);

describe("AccountDataStore.deleteUserData", () => {
  it("할 일 삭제 → 피드백 익명화 → 단일 문서 삭제 순서로 커밋한다", async () => {
    const { fetchFn, commits } = fakeFirestore({
      todos: [rows("todos", ["t1", "t2"])],
      feedback: [rows("feedback", ["f1"])],
    });
    await store(fetchFn as unknown as typeof fetch).deleteUserData("u1");

    expect(commits).toEqual([
      [{ delete: `${ROOT}/todos/t1` }, { delete: `${ROOT}/todos/t2` }],
      [{ update: { name: `${ROOT}/feedback/f1`, fields: {} }, updateMask: { fieldPaths: ["userId", "email"] } }],
      [
        { delete: `${ROOT}/userSettings/u1` },
        { delete: `${ROOT}/calendarIntegrations/u1` },
        { delete: `${ROOT}/entitlements/u1` },
      ],
    ]);
  });

  it("할 일이 500건을 넘으면 조회가 빌 때까지 500건씩 나눠 지운다", async () => {
    const first = Array.from({ length: 500 }, (_, i) => `a${i}`);
    const second = ["b1", "b2"];
    const { fetchFn, commits, queries } = fakeFirestore({
      todos: [rows("todos", first), rows("todos", second)],
      feedback: [],
    });
    await store(fetchFn as unknown as typeof fetch).deleteUserData("u1");

    expect(queries.filter((q) => q.collectionId === "todos")).toHaveLength(3);
    expect(queries.every((q) => q.limit === 500)).toBe(true);
    expect(commits[0]).toHaveLength(500);
    expect(commits[1]).toEqual([{ delete: `${ROOT}/todos/b1` }, { delete: `${ROOT}/todos/b2` }]);
  });

  it("지울 것이 없어도 단일 문서 삭제 커밋은 보낸다(없는 문서 삭제는 성공)", async () => {
    const { fetchFn, commits } = fakeFirestore({ todos: [], feedback: [] });
    await store(fetchFn as unknown as typeof fetch).deleteUserData("u1");
    expect(commits).toHaveLength(1);
  });

  it("조회 실패는 던진다", async () => {
    const fetchFn = vi.fn(async () => jsonRes({ error: {} }, 500));
    await expect(store(fetchFn as unknown as typeof fetch).deleteUserData("u1")).rejects.toThrow("Firestore todos 조회 실패 (500)");
  });

  it("커밋 실패는 던진다", async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith(":runQuery") ? jsonRes(rows("todos", ["t1"])) : jsonRes({ error: {} }, 503),
    );
    await expect(store(fetchFn as unknown as typeof fetch).deleteUserData("u1")).rejects.toThrow("Firestore 커밋 실패 (503)");
  });
});
