import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { createEnv, dbAs, seed, todoDoc } from "./env";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterAll(async () => {
  await env?.cleanup(); // beforeAll(createEnv)가 실패하면 env가 없다 — 원래 오류를 가리지 않게
});

const alice = () => dbAs(env, "alice");
const bob = () => dbAs(env, "bob");
const anon = () => dbAs(env, null);

describe("todos read", () => {
  beforeEach(async () => {
    await seed(env, "todos/a1", todoDoc());
  });

  it("본인 문서는 읽는다", async () => {
    await assertSucceeds(getDoc(doc(alice(), "todos/a1")));
  });
  it("남의 문서는 못 읽는다", async () => {
    await assertFails(getDoc(doc(bob(), "todos/a1")));
  });
  it("비로그인은 못 읽는다", async () => {
    await assertFails(getDoc(doc(anon(), "todos/a1")));
  });
});

describe("todos query", () => {
  beforeEach(async () => {
    await seed(env, "todos/a1", todoDoc());
    await seed(env, "todos/b1", todoDoc({ userId: "bob" }));
  });

  it("userId 조건이 있는 조회는 허용된다", async () => {
    await assertSucceeds(getDocs(query(collection(alice(), "todos"), where("userId", "==", "alice"))));
  });
  it("userId 조건이 없는 전체 조회는 거부된다", async () => {
    await assertFails(getDocs(collection(alice(), "todos")));
  });
  it("parentId만 건 조회는 결과가 0건이어도 거부된다(G1 원인)", async () => {
    await assertFails(getDocs(query(collection(alice(), "todos"), where("parentId", "==", "none"))));
  });
});

describe("todos create", () => {
  it("본인 userId로 만든다", async () => {
    await assertSucceeds(addDoc(collection(alice(), "todos"), todoDoc()));
  });
  it("남의 userId로는 못 만든다", async () => {
    await assertFails(addDoc(collection(alice(), "todos"), todoDoc({ userId: "bob" })));
  });
  it("비로그인은 못 만든다", async () => {
    await assertFails(addDoc(collection(anon(), "todos"), todoDoc()));
  });
  it("description 2000자는 허용된다", async () => {
    await assertSucceeds(addDoc(collection(alice(), "todos"), todoDoc({ description: "가".repeat(2000) })));
  });
  it("description 2001자는 거부된다", async () => {
    await assertFails(addDoc(collection(alice(), "todos"), todoDoc({ description: "가".repeat(2001) })));
  });
  it("description이 문자열이 아니면 거부된다", async () => {
    await assertFails(addDoc(collection(alice(), "todos"), todoDoc({ description: 123 })));
  });
  it("description null은 허용된다", async () => {
    await assertSucceeds(addDoc(collection(alice(), "todos"), todoDoc({ description: null })));
  });
});

describe("todos update", () => {
  beforeEach(async () => {
    await seed(env, "todos/a1", todoDoc());
    // 상한 도입 전에 저장된 긴 description 문서
    await seed(env, "todos/long", todoDoc({ description: "가".repeat(2001) }));
  });

  it("본인 문서의 title을 바꾼다", async () => {
    await assertSucceeds(updateDoc(doc(alice(), "todos/a1"), { title: "새 제목" }));
  });
  it("남의 문서는 못 바꾼다", async () => {
    await assertFails(updateDoc(doc(bob(), "todos/a1"), { title: "탈취" }));
  });
  it("userId를 남으로 바꿀 수 없다", async () => {
    await assertFails(updateDoc(doc(alice(), "todos/a1"), { userId: "bob" }));
  });
  it("set으로 문서를 덮어 userId를 바꿀 수도 없다", async () => {
    await assertFails(setDoc(doc(alice(), "todos/a1"), todoDoc({ userId: "bob" })));
  });
  it("긴 description 문서도 description을 건드리지 않는 수정은 된다", async () => {
    await assertSucceeds(updateDoc(doc(alice(), "todos/long"), { status: "done" }));
  });
  it("긴 description을 다른 긴 값으로 바꾸는 건 거부된다", async () => {
    await assertFails(updateDoc(doc(alice(), "todos/long"), { description: "나".repeat(2001) }));
  });
});

describe("todos delete", () => {
  beforeEach(async () => {
    await seed(env, "todos/a1", todoDoc());
  });

  it("본인 문서는 지운다", async () => {
    await assertSucceeds(deleteDoc(doc(alice(), "todos/a1")));
  });
  it("남의 문서는 못 지운다", async () => {
    await assertFails(deleteDoc(doc(bob(), "todos/a1")));
  });
  it("없는 문서 삭제는 거부된다(resource가 null)", async () => {
    await assertFails(deleteDoc(doc(alice(), "todos/missing")));
  });
});
