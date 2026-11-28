/**
 * 반복 시리즈·앱 진입 정리·AI 플랜 저장을 에뮬레이터 + 실제 firestore.rules 위에서 돌린다.
 * 모두 writeBatch와 userId 조건 쿼리를 쓰므로, 쿼리 모양이나 batch 안의 문서 하나가 rules에
 * 걸리면 전체가 실패한다 — 단위 테스트(mock)로는 드러나지 않는 부분이다.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, getDocs, query, where, type Firestore } from "firebase/firestore";
import { createPlanTodos } from "../api/planTodoApi";
import { fetchAllUserTodos } from "../api/todoApi";
import {
  createRecurringTodo,
  deleteRecurringSeries,
  editRecurringSeries,
} from "../recurring/seriesApi";
import { runStartupMaintenance } from "../recurring/startupMaintenanceApi";
import type { RecurrenceRule } from "../types/todo";
import { createEnv, dbAs, seed, todoDoc } from "./env";

let env: RulesTestEnvironment;
let db: Firestore;

const DAILY: RecurrenceRule = { type: "daily", endType: "indefinite" };
// 로컬 시각 기준 고정 시점(절대 날짜를 기대값에 박지 않고, 이 시점에서 상대적으로 계산한다).
const NOW = new Date(2026, 0, 5, 9, 0);
const addDays = (base: Date, days: number) => new Date(base.getTime() + days * 86_400_000);

/** rules를 끄고 사용자 문서 전체를 본다(남의 문서가 그대로인지 확인용). */
const allDocsOf = async (userId: string) => {
  let ids: string[] = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDocs(
      query(collection(ctx.firestore() as unknown as Firestore, "todos"), where("userId", "==", userId)),
    );
    ids = snap.docs.map((d) => d.id);
  });
  return ids;
};

const newSeries = (horizonEnd: Date) =>
  createRecurringTodo(
    db,
    "alice",
    {
      title: "매일 운동",
      priority: "medium",
      startAt: NOW.toISOString(),
      dueAt: new Date(NOW.getTime() + 3_600_000).toISOString(),
      parentId: null,
      recurrence: DAILY,
    },
    horizonEnd,
  );

beforeAll(async () => {
  env = await createEnv();
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await env.clearFirestore();
  db = dbAs(env, "alice");
  // 다른 사용자의 반복 회차가 섞인 상태
  await seed(env, "todos/bob_r1", todoDoc({ userId: "bob", recurrenceId: "bobSeries", recurrence: DAILY }));
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(async () => {
  await env.cleanup();
});

describe("반복 시리즈", () => {
  it("createRecurringTodo는 회차 문서를 모두 본인 소유로 만든다", async () => {
    const created = await newSeries(addDays(NOW, 7));
    expect(created.length).toBeGreaterThan(1);
    const stored = await fetchAllUserTodos(db, "alice");
    expect(stored).toHaveLength(created.length);
    expect(stored.every((t) => t.userId === "alice")).toBe(true);
  });

  it("editRecurringSeries로 시리즈 제목을 바꾼다", async () => {
    const created = await newSeries(addDays(NOW, 7));
    await editRecurringSeries(
      db,
      "alice",
      { ...created[0], title: "매일 산책", recurrence: DAILY },
      addDays(NOW, 7),
    );
    const stored = await fetchAllUserTodos(db, "alice");
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every((t) => t.title === "매일 산책")).toBe(true);
  });

  it("deleteRecurringSeries는 회차와 회차의 하위를 함께 지우고 남의 회차는 남긴다", async () => {
    const created = await newSeries(addDays(NOW, 7));
    await seed(env, "todos/child1", todoDoc({ parentId: created[0].id }));
    await deleteRecurringSeries(db, "alice", created[0].recurrenceId!);
    expect(await allDocsOf("alice")).toEqual([]);
    expect(await allDocsOf("bob")).toEqual(["bob_r1"]);
  });

  it("회차가 31개여도(하위 조회가 30개씩 나뉨) 모두 지운다", async () => {
    for (let i = 0; i < 31; i++) {
      await seed(env, `todos/r31_${i}`, todoDoc({ recurrenceId: "r31", recurrence: DAILY, order: i }));
      await seed(env, `todos/r31_child_${i}`, todoDoc({ parentId: `r31_${i}` }));
    }
    await deleteRecurringSeries(db, "alice", "r31");
    expect(await allDocsOf("alice")).toEqual([]);
  });
});

describe("runStartupMaintenance", () => {
  it("보관·지난 회차·확장 스윕이 rules에 막히지 않는다", async () => {
    // 31일 전에 끝난 일반 할 일(보관 대상)
    await seed(
      env,
      "todos/oldDone",
      todoDoc({ status: "done", doneAt: addDays(NOW, -31).toISOString() }),
    );
    // 짧은 호라이즌으로 만든 시리즈 → 10일 뒤에는 지난 회차와 확장이 모두 생긴다
    await newSeries(addDays(NOW, 3));
    vi.setSystemTime(addDays(NOW, 10));

    const result = await runStartupMaintenance(db, "alice");
    expect(result.failedSweeps).toEqual([]);
    expect(result.written).toBeGreaterThan(0);
    expect(await allDocsOf("bob")).toEqual(["bob_r1"]);
  });
});

describe("createPlanTodos", () => {
  it("상위 1개와 하위 2개를 본인 소유로 한 번에 만든다", async () => {
    const { parentId, count } = await createPlanTodos(db, "alice", {
      parent: { title: "발표 준비", dueDate: null, priority: "high" },
      children: [
        { title: "자료 조사", dueDate: null, priority: "medium" },
        { title: "슬라이드", dueDate: null, priority: "low" },
      ],
    });
    const stored = await fetchAllUserTodos(db, "alice");
    expect(count).toBe(3); // 상위 포함 개수
    expect(stored).toHaveLength(3);
    expect(stored.filter((t) => t.parentId === parentId)).toHaveLength(2);
    expect(stored.every((t) => t.userId === "alice")).toBe(true);
  });
});
