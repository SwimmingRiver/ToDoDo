import { type Firestore } from "firebase/firestore";
import type { PlanSubmission, PlanTodoInput } from "../aiPlan/types.js";
export type { PlanSubmission, PlanTodoInput };
/** 사용자의 루트(parentId === null) 할 일 중 다음에 쓸 order 값을 계산한다. */
/**
 * AI 플랜 미리보기에서 사용자가 편집을 마친 초안을 저장한다. 상위 1개와 하위 N개를
 * writeBatch 한 번으로 만든다. createTodo 후 createChildTodo를 N번 부르면 중간 실패 시
 * "하위가 반쯤만 있는 플랜"이 남기 때문이다. 상위 문서 id는 doc(todosRef)로 미리 만들어
 * 하위의 parentId에 넣는다. 전부 "todo"로 시작하므로 상위 상태 재계산은 필요 없다.
 * startAt이 모두 null이라 assertValidTodoDates(startAt ≤ dueAt)는 항상 만족한다.
 */
export declare const createPlanTodos: (db: Firestore, userId: string, submission: PlanSubmission) => Promise<{
    parentId: string;
    count: number;
}>;
