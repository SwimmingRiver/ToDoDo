/**
 * core 할 일 api를 mock 없이 에뮬레이터 + 실제 firestore.rules 위에서 돌린다.
 * 단위 테스트(api/__tests__)는 Firestore를 mock해 rules를 거치지 않으므로, 쿼리 모양 때문에
 * rules가 거부하는 버그(11-22 G1: deleteTodo 하위 조회에 userId 조건 누락)는 여기서만 잡힌다.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, type Firestore } from "firebase/firestore";
import {
  createTodo,
  deleteTodo,
  fetchAllUserTodos,
  getTodos,
  updateTodo,
} from "../api/todoApi";
import { getNextRootOrder } from "../api/todoDocs";
import { createEnv, dbAs, seed, todoDoc } from "./env";

let env: RulesTestEnvironment;
let db: Firestore;

/** rules를 끄고 문서가 남아 있는지 본다(삭제된 문서를 본인 컨텍스트로 읽으면 rules가 거부한다). */
const exists = async (path: string): Promise<boolean> => {
  let found = false;
  await env.withSecurityRulesDisabled(async (ctx) => {
    found = (await getDoc(doc(ctx.firestore() as unknown as Firestore, path))).exists();
  });
  return found;
};

beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  db = dbAs(env, "alice");
  // 다른 사용자 데이터가 섞인 상태 — 본인 함수가 이 때문에 거부되거나 이를 건드리면 안 된다.
  await seed(env, "todos/bobParent", todoDoc({ userId: "bob", title: "bob 상위" }));
  await seed(env, "todos/bobChild", todoDoc({ userId: "bob", parentId: "bobParent", order: 0 }));
});
afterAll(async () => {
  await env.cleanup();
});

describe("조회", () => {
  beforeEach(async () => {
    await seed(env, "todos/a1", todoDoc({ order: 0 }));
    await seed(env, "todos/a2", todoDoc({ order: 1, archived: true }));
  });

  it("getTodos는 본인의 보관 안 된 할 일만 돌려준다", async () => {
    const todos = await getTodos(db, "alice");
    expect(todos.map((t) => t.id)).toEqual(["a1"]);
  });
  it("fetchAllUserTodos는 보관분 포함 본인 것만 돌려준다", async () => {
    const ids = (await fetchAllUserTodos(db, "alice")).map((t) => t.id).sort();
    expect(ids).toEqual(["a1", "a2"]);
  });
  it("getNextRootOrder는 본인 상위 할 일 기준 다음 순서를 준다", async () => {
    await expect(getNextRootOrder(db, "alice")).resolves.toBe(2);
  });
});

describe("쓰기", () => {
  it("createTodo는 본인 소유 문서를 만든다", async () => {
    const id = await createTodo(db, "alice", {
      title: "새 할 일",
      priority: "high",
      startAt: null,
      dueAt: null,
      parentId: null,
      order: 0,
    });
    const todos = await fetchAllUserTodos(db, "alice");
    expect(todos.find((t) => t.id === id)?.userId).toBe("alice");
  });

  it("updateTodo로 하위를 완료하면 상위 재계산까지 한 batch로 성공한다", async () => {
    await seed(env, "todos/p", todoDoc());
    await seed(env, "todos/c1", todoDoc({ parentId: "p" }));
    const all = await fetchAllUserTodos(db, "alice");
    await updateTodo(db, "c1", { status: "done", doneAt: "2026-01-02T00:00:00.000Z" }, all);
    const parent = (await fetchAllUserTodos(db, "alice")).find((t) => t.id === "p");
    expect(parent?.status).toBe("done");
  });
});

describe("deleteTodo", () => {
  it("하위 없는 상위를 지운다", async () => {
    await seed(env, "todos/solo", todoDoc());
    await deleteTodo(db, "alice", "solo");
    expect(await exists("todos/solo")).toBe(false);
  });

  it("하위가 있는 상위를 하위와 함께 지우고, 남의 문서는 그대로 둔다", async () => {
    await seed(env, "todos/p", todoDoc());
    await seed(env, "todos/c1", todoDoc({ parentId: "p" }));
    await seed(env, "todos/c2", todoDoc({ parentId: "p", order: 1 }));
    await deleteTodo(db, "alice", "p");
    expect(await exists("todos/p")).toBe(false);
    expect(await exists("todos/c1")).toBe(false);
    expect(await exists("todos/c2")).toBe(false);
    expect(await exists("todos/bobParent")).toBe(true);
    expect(await exists("todos/bobChild")).toBe(true);
  });

  it("남의 할 일 id로는 지울 수 없다", async () => {
    await expect(deleteTodo(db, "alice", "bobParent")).rejects.toThrow();
    expect(await exists("todos/bobParent")).toBe(true);
  });
});
