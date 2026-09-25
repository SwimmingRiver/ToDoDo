import type { GeneratedPlan, PlanPriority } from "../api";
import type { PlanSubmission } from "@/features/todo/api";

export interface DraftFields {
  title: string;
  /** "yyyy-MM-dd" 로컬 날짜 키 또는 null */
  dueDate: string | null;
  priority: PlanPriority;
}

export interface DraftItem extends DraftFields {
  key: string;
  checked: boolean;
}

export interface PlanDraft {
  parent: DraftFields;
  items: DraftItem[];
  /** 사용자가 AI 결과를 고쳤는지. 닫기·다시 만들기 전에 확인을 받을지 정한다. */
  dirty: boolean;
  /** key 발급용 카운터. 삭제 후 추가해도 key가 겹치지 않게 reducer 상태로 둔다. */
  nextKey: number;
}

export type PlanDraftAction =
  | { type: "load"; plan: GeneratedPlan }
  | { type: "updateParent"; patch: Partial<DraftFields> }
  | { type: "updateItem"; key: string; patch: Partial<DraftFields> }
  | { type: "toggleItem"; key: string }
  | { type: "removeItem"; key: string }
  | { type: "addItem" };

export const EMPTY_DRAFT: PlanDraft = {
  parent: { title: "", dueDate: null, priority: "medium" },
  items: [],
  dirty: false,
  nextKey: 0,
};

const mapItem = (state: PlanDraft, key: string, fn: (item: DraftItem) => DraftItem): PlanDraft => ({
  ...state,
  items: state.items.map((item) => (item.key === key ? fn(item) : item)),
  dirty: true,
});

export const planDraftReducer = (state: PlanDraft, action: PlanDraftAction): PlanDraft => {
  switch (action.type) {
    case "load":
      return {
        parent: { title: action.plan.title, dueDate: action.plan.dueDate, priority: "medium" },
        items: action.plan.items.map((item, index) => ({ ...item, key: `item-${index}`, checked: true })),
        dirty: false,
        nextKey: action.plan.items.length,
      };
    case "updateParent":
      return { ...state, parent: { ...state.parent, ...action.patch }, dirty: true };
    case "updateItem":
      return mapItem(state, action.key, (item) => ({ ...item, ...action.patch }));
    case "toggleItem":
      return mapItem(state, action.key, (item) => ({ ...item, checked: !item.checked }));
    case "removeItem":
      return { ...state, items: state.items.filter((item) => item.key !== action.key), dirty: true };
    case "addItem":
      return {
        ...state,
        items: [
          ...state.items,
          { key: `item-${state.nextKey}`, title: "", dueDate: null, priority: "medium", checked: true },
        ],
        nextKey: state.nextKey + 1,
        dirty: true,
      };
  }
};

export const checkedCount = (draft: PlanDraft): number =>
  draft.items.filter((item) => item.checked).length;

export const canSubmit = (draft: PlanDraft): boolean => {
  const checked = draft.items.filter((item) => item.checked);
  return (
    draft.parent.title.trim().length > 0 &&
    checked.length > 0 &&
    checked.every((item) => item.title.trim().length > 0)
  );
};

export const toSubmission = (draft: PlanDraft): PlanSubmission => ({
  parent: { ...draft.parent, title: draft.parent.title.trim() },
  children: draft.items
    .filter((item) => item.checked)
    .map(({ title, dueDate, priority }) => ({ title: title.trim(), dueDate, priority })),
});
