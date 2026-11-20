import type { GeneratedPlan, PlanPriority, PlanSubmission } from "./types.js";
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
export type PlanDraftAction = {
    type: "load";
    plan: GeneratedPlan;
} | {
    type: "updateParent";
    patch: Partial<DraftFields>;
} | {
    type: "updateItem";
    key: string;
    patch: Partial<DraftFields>;
} | {
    type: "toggleItem";
    key: string;
} | {
    type: "removeItem";
    key: string;
} | {
    type: "addItem";
};
export declare const EMPTY_DRAFT: PlanDraft;
export declare const planDraftReducer: (state: PlanDraft, action: PlanDraftAction) => PlanDraft;
export declare const checkedCount: (draft: PlanDraft) => number;
export declare const canSubmit: (draft: PlanDraft) => boolean;
export declare const toSubmission: (draft: PlanDraft) => PlanSubmission;
