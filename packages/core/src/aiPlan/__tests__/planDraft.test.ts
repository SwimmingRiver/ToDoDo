import { describe, it, expect } from "vitest";
import {
  EMPTY_DRAFT,
  planDraftReducer,
  canSubmit,
  checkedCount,
  toSubmission,
  type PlanDraft,
} from "../planDraft";

const plan = {
  title: "이사 준비",
  dueDate: "2026-10-31",
  items: [
    { title: "견적 받기", dueDate: "2026-10-03", priority: "high" as const },
    { title: "짐 정리", dueDate: null, priority: "low" as const },
  ],
};
const loaded = (): PlanDraft => planDraftReducer(EMPTY_DRAFT, { type: "load", plan });

describe("planDraftReducer", () => {
  it("load: 상위는 medium 우선순위, 하위는 전부 체크, dirty=false", () => {
    const draft = loaded();
    expect(draft.parent).toEqual({ title: "이사 준비", dueDate: "2026-10-31", priority: "medium" });
    expect(draft.items.map((i) => [i.key, i.checked])).toEqual([["item-0", true], ["item-1", true]]);
    expect(draft.dirty).toBe(false);
  });

  it("load는 이전 편집을 덮어쓰고 dirty를 초기화한다(다시 만들기)", () => {
    const edited = planDraftReducer(loaded(), { type: "addItem" });
    const reloaded = planDraftReducer(edited, { type: "load", plan });
    expect(reloaded.items).toHaveLength(2);
    expect(reloaded.dirty).toBe(false);
  });

  it("updateParent/updateItem은 해당 필드만 바꾸고 dirty=true", () => {
    let draft = planDraftReducer(loaded(), { type: "updateParent", patch: { title: "새 이사" } });
    draft = planDraftReducer(draft, { type: "updateItem", key: "item-1", patch: { dueDate: "2026-10-10" } });
    expect(draft.parent.title).toBe("새 이사");
    expect(draft.items[1]).toMatchObject({ title: "짐 정리", dueDate: "2026-10-10" });
    expect(draft.dirty).toBe(true);
  });

  it("toggleItem은 체크를 뒤집고, removeItem은 목록에서 뺀다", () => {
    let draft = planDraftReducer(loaded(), { type: "toggleItem", key: "item-0" });
    expect(draft.items[0].checked).toBe(false);
    draft = planDraftReducer(draft, { type: "removeItem", key: "item-1" });
    expect(draft.items.map((i) => i.key)).toEqual(["item-0"]);
  });

  it("addItem은 빈 체크 항목을 겹치지 않는 key로 끝에 붙인다", () => {
    let draft = planDraftReducer(loaded(), { type: "addItem" });
    draft = planDraftReducer(draft, { type: "removeItem", key: "item-2" });
    draft = planDraftReducer(draft, { type: "addItem" });
    expect(draft.items.at(-1)).toEqual({ key: "item-3", title: "", dueDate: null, priority: "medium", checked: true });
  });
});

describe("선택자", () => {
  it("canSubmit: 상위 제목이 있고, 체크된 항목이 1개 이상이며, 체크된 항목 제목이 모두 있을 때만", () => {
    expect(canSubmit(loaded())).toBe(true);
    expect(canSubmit(planDraftReducer(loaded(), { type: "updateParent", patch: { title: "  " } }))).toBe(false);

    let none = planDraftReducer(loaded(), { type: "toggleItem", key: "item-0" });
    none = planDraftReducer(none, { type: "toggleItem", key: "item-1" });
    expect(canSubmit(none)).toBe(false);

    const blankChecked = planDraftReducer(loaded(), { type: "addItem" });
    expect(canSubmit(blankChecked)).toBe(false);
    const blankUnchecked = planDraftReducer(blankChecked, { type: "toggleItem", key: "item-2" });
    expect(canSubmit(blankUnchecked)).toBe(true);
  });

  it("checkedCount", () => {
    expect(checkedCount(planDraftReducer(loaded(), { type: "toggleItem", key: "item-0" }))).toBe(1);
  });

  it("toSubmission: 체크된 항목만, 제목 trim, key/checked 제거", () => {
    let draft = planDraftReducer(loaded(), { type: "toggleItem", key: "item-1" });
    draft = planDraftReducer(draft, { type: "updateItem", key: "item-0", patch: { title: "  견적  " } });
    expect(toSubmission(draft)).toEqual({
      parent: { title: "이사 준비", dueDate: "2026-10-31", priority: "medium" },
      children: [{ title: "견적", dueDate: "2026-10-03", priority: "high" }],
    });
  });
});
