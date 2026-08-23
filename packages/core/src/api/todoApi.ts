import {
  collection,
  addDoc,
  getDocs,
  doc,
  query,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { Todo, TodoFields } from "../types/todo";

const normalizeOrder = (order: number | undefined): number =>
  typeof order === "number" && !Number.isNaN(order) ? order : Infinity;

const mapDocToTodo = (id: string, data: Record<string, unknown>): Todo =>
  ({ id, ...data }) as Todo;

export const getTodos = async (db: Firestore, userId: string): Promise<Todo[]> => {
  const q = query(
    collection(db, "todos"),
    where("userId", "==", userId),
    where("archived", "==", false),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((d) => mapDocToTodo(d.id, d.data()))
    .sort((a, b) => normalizeOrder(a.order) - normalizeOrder(b.order));
};

export const createTodo = async (
  db: Firestore,
  userId: string,
  fields: TodoFields,
): Promise<string> => {
  const now = new Date().toISOString();
  const docRef = await addDoc(collection(db, "todos"), {
    ...fields,
    userId,
    status: "todo",
    doneAt: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
};

type TodoUpdateFields = Partial<TodoFields> & {
  status?: Todo["status"];
  doneAt?: string | null;
};

const calcParentStatus = (
  siblings: Todo[],
): { status: Todo["status"]; doneAt: string | null } => {
  const now = new Date().toISOString();
  if (siblings.every((s) => s.status === "done")) {
    return { status: "done", doneAt: now };
  }
  if (siblings.some((s) => s.status === "doing" || s.status === "done")) {
    return { status: "doing", doneAt: null };
  }
  return { status: "todo", doneAt: null };
};

/**
 * 웹(client/src/features/todo/api/todoApi.ts의 editTodo)과 동일한 부모-자식
 * 캐스케이드를 모바일에도 적용한다. 이게 없으면 모바일에서 부모만 done으로
 * 바꿔도 자식은 그대로 남아, 30일 아카이빙 스윕이 미완료 자식을 놓치는
 * 문제가 생긴다.
 */
export const updateTodo = async (
  db: Firestore,
  id: string,
  fields: TodoUpdateFields,
  allTodos: Todo[],
): Promise<void> => {
  const now = new Date().toISOString();
  const current = allTodos.find((t) => t.id === id);

  const writes: Array<{ id: string; updates: object }> = [
    { id, updates: { ...fields, updatedAt: now } },
  ];

  // 상위 done → 하위 전부 done
  if (fields.status === "done") {
    allTodos
      .filter((t) => t.parentId === id)
      .forEach((child) => {
        writes.push({
          id: child.id,
          updates: { status: "done", doneAt: now, updatedAt: now },
        });
      });
  }

  // 하위 변경 → 상위 상태 재계산
  const parentId = current?.parentId ?? null;
  if (parentId) {
    const updatedTodos = allTodos.map((t) => (t.id === id ? { ...t, ...fields } : t));
    const siblings = updatedTodos.filter((t) => t.parentId === parentId);
    const { status: parentStatus, doneAt } = calcParentStatus(siblings);
    writes.push({ id: parentId, updates: { status: parentStatus, doneAt, updatedAt: now } });
  }

  const batch = writeBatch(db);
  writes.forEach(({ id: writeId, updates }) => {
    batch.update(doc(db, "todos", writeId), updates);
  });
  await batch.commit();
};

export const deleteTodo = async (db: Firestore, id: string): Promise<void> => {
  // 대상이 루트 할 일이면 하위 할 일도 함께 지워야 parentId가 존재하지 않는
  // 문서를 가리키는 고아 문서가 남지 않는다.
  const childrenSnapshot = await getDocs(
    query(collection(db, "todos"), where("parentId", "==", id)),
  );

  const batch = writeBatch(db);
  batch.delete(doc(db, "todos", id));
  childrenSnapshot.docs.forEach((childDoc) => {
    batch.delete(childDoc.ref);
  });
  await batch.commit();
};
