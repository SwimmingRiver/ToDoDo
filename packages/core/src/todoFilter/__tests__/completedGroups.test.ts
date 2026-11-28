import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCompletedGroups, EMPTY_TODO_FILTER } from "../index";
import type { CompletableTodo } from "../index";

const at = (m: number, d: number, h = 12, min = 0): string => new Date(2026, m - 1, d, h, min).toISOString();

const make = (over: Partial<CompletableTodo> & { id: string }): CompletableTodo => ({
  title: over.id,
  parentId: null,
  status: "done",
  updatedAt: at(11, 1),
  ...over,
});

describe("buildCompletedGroups", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 28, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("id 중복은 한 장", () => {
    const a = make({ id: "a", doneAt: at(11, 20) });
    const groups = buildCompletedGroups([a, { ...a }], EMPTY_TODO_FILTER);
    expect(groups).toHaveLength(1);
    expect(groups[0].cards).toHaveLength(1);
  });

  it("완료 루트만 카드, 하위는 children", () => {
    const root = make({ id: "r", doneAt: at(11, 20) });
    const child = make({ id: "c", parentId: "r", doneAt: at(11, 19) });
    const open = make({ id: "o", status: "todo" });
    const groups = buildCompletedGroups([root, child, open], EMPTY_TODO_FILTER);
    expect(groups).toHaveLength(1);
    expect(groups[0].cards).toHaveLength(1);
    const card = groups[0].cards[0];
    expect(card.kind).toBe("project");
    if (card.kind === "project") {
      expect(card.key).toBe("r");
      expect(card.children.map((c) => c.id)).toEqual(["c"]);
    }
  });

  it("월 최신순, 카드 completedAt 최신순, doneAt 없으면 updatedAt", () => {
    const a = make({ id: "a", doneAt: at(10, 5) });
    const b = make({ id: "b", doneAt: at(11, 2) });
    const c = make({ id: "c", doneAt: null, updatedAt: at(11, 9) });
    const groups = buildCompletedGroups([a, b, c], EMPTY_TODO_FILTER);
    expect(groups.map((g) => g.monthKey)).toEqual(["2026-11", "2026-10"]);
    expect(groups[0].cards.map((x) => x.key)).toEqual(["c", "b"]);
    expect(groups[0].cards[0].completedAt).toBe(at(11, 9));
  });

  it("같은 recurrenceId는 달별 series 카드로 묶인다", () => {
    const todos = [
      make({ id: "n1", recurrenceId: "rec", doneAt: at(11, 3) }),
      make({ id: "n2", recurrenceId: "rec", doneAt: at(11, 17) }),
      make({ id: "n3", recurrenceId: "rec", doneAt: at(11, 10) }),
      make({ id: "o1", recurrenceId: "rec", doneAt: at(10, 28) }),
    ];
    const groups = buildCompletedGroups(todos, EMPTY_TODO_FILTER);
    expect(groups.map((g) => g.monthKey)).toEqual(["2026-11", "2026-10"]);
    const nov = groups[0].cards;
    expect(nov).toHaveLength(1);
    const s = nov[0];
    expect(s.kind).toBe("series");
    if (s.kind === "series") {
      expect(s.key).toBe("rec:2026-11");
      expect(s.count).toBe(3);
      expect(s.completedAt).toBe(at(11, 17));
      expect(s.root.id).toBe("n2");
    }
    expect(groups[1].cards).toHaveLength(1);
    expect(groups[1].cards[0].key).toBe("rec:2026-10");
  });

  it("빈 문자열 recurrenceId는 project", () => {
    const g = buildCompletedGroups([make({ id: "a", recurrenceId: "", doneAt: at(11, 1) })], EMPTY_TODO_FILTER);
    expect(g[0].cards[0].kind).toBe("project");
  });

  it("루트는 안 걸리고 하위만 걸리면 카드 + matchedChildIds", () => {
    const root = make({ id: "r", title: "프로젝트", doneAt: at(11, 20) });
    const hit = make({ id: "c1", parentId: "r", title: "장보기" });
    const miss = make({ id: "c2", parentId: "r", title: "청소" });
    const groups = buildCompletedGroups([root, hit, miss], { query: "장보", priorities: [] });
    expect(groups).toHaveLength(1);
    const card = groups[0].cards[0];
    if (card.kind !== "project") throw new Error("project expected");
    expect([...card.matchedChildIds]).toEqual(["c1"]);
    expect(card.children).toHaveLength(2);
  });

  it("루트가 걸려도 걸린 하위는 matchedChildIds에 담긴다", () => {
    const root = make({ id: "r", title: "장보기 프로젝트", doneAt: at(11, 20) });
    const hit = make({ id: "c1", parentId: "r", title: "장보기 목록" });
    const groups = buildCompletedGroups([root, hit], { query: "장보기", priorities: [] });
    const card = groups[0].cards[0];
    if (card.kind !== "project") throw new Error("project expected");
    expect([...card.matchedChildIds]).toEqual(["c1"]);
  });

  it("아무것도 안 걸리면 카드 없고 빈 그룹도 없다", () => {
    const root = make({ id: "r", doneAt: at(11, 20) });
    expect(buildCompletedGroups([root], { query: "zzz", priorities: [] })).toEqual([]);
  });

  it("series는 회차 중 하나라도 걸리면 표시", () => {
    const todos = [
      make({ id: "a", title: "물주기", recurrenceId: "rec", doneAt: at(11, 3) }),
      make({ id: "b", title: "물주기 2", recurrenceId: "rec", doneAt: at(11, 4), priority: "high" }),
    ];
    const groups = buildCompletedGroups(todos, { query: "", priorities: ["high"] });
    expect(groups[0].cards).toHaveLength(1);
  });

  it("필터가 꺼지면 모든 카드, matchedChildIds 비어 있음", () => {
    const root = make({ id: "r", doneAt: at(11, 20) });
    const child = make({ id: "c", parentId: "r" });
    const card = buildCompletedGroups([root, child], EMPTY_TODO_FILTER)[0].cards[0];
    if (card.kind !== "project") throw new Error("project expected");
    expect(card.matchedChildIds.size).toBe(0);
  });

  it("월 경계: 로컬 11-30 23:30은 2026-11", () => {
    const g = buildCompletedGroups([make({ id: "a", doneAt: at(11, 30, 23, 30) })], EMPTY_TODO_FILTER);
    expect(g[0].monthKey).toBe("2026-11");
  });

  it("월 경계: 로컬 12-01 00:30은 2026-12", () => {
    const g = buildCompletedGroups([make({ id: "a", doneAt: at(12, 1, 0, 30) })], EMPTY_TODO_FILTER);
    expect(g[0].monthKey).toBe("2026-12");
  });
});
