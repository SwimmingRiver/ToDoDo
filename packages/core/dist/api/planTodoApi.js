import { collection, doc, getDocs, query, where, writeBatch, } from "firebase/firestore";
import { parseDateKey } from "../insights/date.js";
const dateKeyToISO = (key) => (key ? parseDateKey(key).toISOString() : null);
/** 사용자의 루트(parentId === null) 할 일 중 다음에 쓸 order 값을 계산한다. */
const getNextRootOrder = async (db, userId) => {
    const rootTodosSnapshot = await getDocs(query(collection(db, "todos"), where("userId", "==", userId), where("parentId", "==", null)));
    const maxOrder = rootTodosSnapshot.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), -1);
    return maxOrder + 1;
};
/**
 * AI 플랜 미리보기에서 사용자가 편집을 마친 초안을 저장한다. 상위 1개와 하위 N개를
 * writeBatch 한 번으로 만든다. createTodo 후 createChildTodo를 N번 부르면 중간 실패 시
 * "하위가 반쯤만 있는 플랜"이 남기 때문이다. 상위 문서 id는 doc(todosRef)로 미리 만들어
 * 하위의 parentId에 넣는다. 전부 "todo"로 시작하므로 상위 상태 재계산은 필요 없다.
 * startAt이 모두 null이라 assertValidTodoDates(startAt ≤ dueAt)는 항상 만족한다.
 */
export const createPlanTodos = async (db, userId, submission) => {
    if (submission.children.length === 0) {
        throw new Error("AI 플랜에는 하위 할 일이 1개 이상 필요합니다");
    }
    const todosRef = collection(db, "todos");
    const now = new Date().toISOString();
    const base = {
        userId,
        status: "todo",
        startAt: null,
        doneAt: null,
        recurrence: null,
        recurrenceId: null,
        archived: false,
        createdAt: now,
        updatedAt: now,
    };
    const parentRef = doc(todosRef);
    const parentOrder = await getNextRootOrder(db, userId);
    const batch = writeBatch(db);
    batch.set(parentRef, {
        ...base,
        title: submission.parent.title,
        priority: submission.parent.priority,
        dueAt: dateKeyToISO(submission.parent.dueDate),
        parentId: null,
        order: parentOrder,
    });
    submission.children.forEach((child, index) => {
        batch.set(doc(todosRef), {
            ...base,
            title: child.title,
            priority: child.priority,
            dueAt: dateKeyToISO(child.dueDate),
            parentId: parentRef.id,
            order: index,
        });
    });
    await batch.commit();
    return { parentId: parentRef.id, count: submission.children.length + 1 };
};
