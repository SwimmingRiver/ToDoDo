import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import * as Sentry from "@sentry/react";
// 부모-자식 상태 판정 규칙은 모바일(packages/core)과 동일해야 하므로 그쪽을
// 유일한 소스로 두고 가져다 쓴다(아래에서 재수출도 함께 한다). 로컬에 따로
// 정의하면 규칙이 바뀔 때 한쪽만 고치고 다른 쪽을 잊는 드리프트가 생긴다.
import {
  calcParentStatus,
  createRecurringTodo as coreCreateRecurringTodo,
  deleteRecurringSeries as coreDeleteRecurringSeries,
  editRecurringSeries as coreEditRecurringSeries,
  runStartupMaintenance as coreRunStartupMaintenance,
} from "@tododo/core";
import { auth } from "@/shared/lib/firebase";
import { db } from "@/shared/lib/firestore";
import { localDateKeyToISO } from "@/shared/utils/date";
import type { RecurrenceRule, Todo, TodoReorderUpdate } from "../types/todo.type";
import { getDefaultHorizonEnd } from "../utils/recurrence";
import { getTodoDateValidationError } from "../utils/todoDateValidation";

const todosRef = collection(db, "todos");

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  return user.uid;
};

// insights 피처의 getAllTodosForStats()도 이 매핑을 그대로 재사용한다 —
// 필드 매핑 로직이 두 곳에서 각자 따로 관리되면 드리프트가 생기기 쉽다.
export const mapDocToTodo = (id: string, data: Record<string, unknown>): Todo =>
  ({ id, ...data }) as Todo;

/**
 * order 필드가 도입되기 전에 만들어진 레거시 문서는 order가 아예 없다(undefined).
 * `a.order - b.order`에 undefined가 섞이면 NaN을 반환하는데, sort 비교 함수가 NaN을
 * 반환하면 그 비교뿐 아니라 배열 전체의 정렬 결과가 신뢰할 수 없어진다(V8 정렬
 * 알고리즘이 비교 결과의 일관성을 전제하므로, 일부 쌍이 NaN이면 관련 없는 다른
 * 요소들의 상대 순서까지 흐트러질 수 있다) — 실제로 이 상태에서 정상 order를 가진
 * 문서들끼리도 전혀 정렬되지 않는 것을 확인했다. order 없는 문서를 맨 뒤로 보내
 * 비교가 항상 유효한 숫자를 반환하도록 방어한다.
 */
const normalizeOrder = (order: number | undefined): number =>
  typeof order === "number" && !Number.isNaN(order) ? order : Infinity;

/**
 * 반복(recurrence)과 하위 할 일(parentId)은 상호 배제 관계다 (PM 확정 스코프).
 * UI에서 이미 막고 있지만, UI 우회(직접 API 호출 등)를 방지하기 위해 데이터 레이어에서도
 * 방어적으로 막는다. "조용히 무시하고 recurrence를 강제로 null 처리"하는 대신 명시적으로
 * 에러를 던지는 쪽을 택했다 — 호출부가 두 필드를 동시에 채워 넣었다는 것은 상위 로직에
 * 버그가 있다는 신호이므로, 값을 조용히 바꿔 저장하기보다 즉시 실패시켜 드러내는 편이
 * 데이터 정합성을 지키는 데 더 안전하다고 판단했다.
 */
const assertNoRecurrenceParentConflict = (todo: {
  parentId: string | null;
  recurrence: RecurrenceRule | null;
}) => {
  if (todo.parentId && todo.recurrence) {
    throw new Error(
      "하위 할 일에는 반복을 설정할 수 없고, 반복 할 일은 하위 할 일이 될 수 없습니다",
    );
  }
};

/**
 * getTodoDateValidationError와 동일한 규칙(시작일시 ≤ 마감일시)을 데이터 레이어에서도
 * 강제한다. assertNoRecurrenceParentConflict와 같은 이유 — 폼에서 이미 막아도 API를
 * 직접 호출하는 경로(테스트, 향후 다른 클라이언트 등)를 우회하지 못하게 방어한다.
 */
const assertValidTodoDates = (todo: { startAt: string | null; dueAt: string | null }) => {
  const error = getTodoDateValidationError(todo.startAt, todo.dueAt);
  if (error) throw new Error(error);
};

export const getTodos = async () => {
  const userId = getUserId();
  const q = query(
    todosRef,
    where("userId", "==", userId),
    where("archived", "==", false),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((doc) => mapDocToTodo(doc.id, doc.data()))
    .sort((a, b) => normalizeOrder(a.order) - normalizeOrder(b.order));
};

export const getTodoDetail = async (id: string) => {
  const userId = getUserId();
  const snapshot = await getDoc(doc(db, "todos", id));
  if (!snapshot.exists()) throw new Error("Todo not found");
  const data = snapshot.data();
  if (data.userId !== userId) throw new Error("Forbidden");
  return mapDocToTodo(snapshot.id, data);
};

export const getSearchTodoList = async (queryStr: string) => {
  const todos = await getTodos();
  return todos.filter((todo) =>
    todo.title.toLowerCase().includes(queryStr.toLowerCase()),
  );
};

export const createTodo = async (todo: Todo) => {
  assertNoRecurrenceParentConflict(todo);
  assertValidTodoDates(todo);
  const userId = getUserId();
  const now = new Date().toISOString();
  const { id: _, ...todoData } = todo;

  const rootTodosSnapshot = await getDocs(
    query(todosRef, where("userId", "==", userId), where("parentId", "==", null)),
  );
  const maxOrder = rootTodosSnapshot.docs.reduce(
    (max, d) => Math.max(max, (d.data().order as number) ?? 0),
    -1,
  );

  const docRef = await addDoc(todosRef, {
    ...todoData,
    userId,
    createdAt: now,
    updatedAt: now,
    parentId: null,
    status: "todo",
    order: maxOrder + 1,
    archived: false,
  });
  return { ...todo, id: docRef.id };
};

// useUpdateTodo.ts 등 기존 호출부가 "../api"에서 그대로 가져다 쓸 수 있도록 재수출한다.
export { calcParentStatus };

export const editTodo = async (todo: Todo, allTodos: Todo[]) => {
  assertNoRecurrenceParentConflict(todo);
  const userId = getUserId();
  const { id, ...data } = todo;
  const now = new Date().toISOString();

  const docRef = doc(db, "todos", id);
  const existing = await getDoc(docRef);
  if (!existing.exists()) throw new Error("Todo not found");
  const existingData = existing.data();
  if (existingData.userId !== userId) throw new Error("Forbidden");

  // 이미 저장돼 있던(레거시) startAt/dueAt까지 소급 검증하면, 날짜와 무관한 필드만
  // 바꾸는 편집(상태 토글 등)까지 전부 막혀버린다. 이번 편집이 실제로 날짜 값을
  // 바꿀 때만 검증한다.
  if (data.startAt !== existingData.startAt || data.dueAt !== existingData.dueAt) {
    assertValidTodoDates(data);
  }

  const writes: Array<{ id: string; updates: object }> = [
    { id, updates: { ...data, updatedAt: now } },
  ];

  // 상위 done → 하위 전부 done
  if (data.status === "done") {
    allTodos
      .filter((t) => t.parentId === id)
      .forEach((child) => {
        writes.push({
          id: child.id,
          updates: { status: "done", doneAt: now, updatedAt: now },
        });
      });
  }

  // 하위 변경 → 상위 상태 재계산 (캐시 기반)
  if (todo.parentId) {
    const updatedTodos = allTodos.map((t) =>
      t.id === id ? { ...t, ...data } : t,
    );
    const siblings = updatedTodos.filter((t) => t.parentId === todo.parentId);
    const { status: parentStatus, doneAt } = calcParentStatus(siblings);
    writes.push({
      id: todo.parentId,
      updates: { status: parentStatus, doneAt, updatedAt: now },
    });
  }

  // 상위/하위 상태 동기화 쓰기가 부분 실패하면 데이터가 어긋나므로, 하나의 batch로
  // 묶어 전부 성공하거나 전부 실패하게 만든다.
  const batch = writeBatch(db);
  writes.forEach(({ id: writeId, updates }) => {
    batch.update(doc(db, "todos", writeId), updates);
  });
  await batch.commit();

  return todo;
};

export const deleteTodo = async (id: string) => {
  const userId = getUserId();
  const docRef = doc(db, "todos", id);
  const existing = await getDoc(docRef);
  if (!existing.exists()) throw new Error("Todo not found");
  const existingData = existing.data();
  if (existingData.userId !== userId) throw new Error("Forbidden");

  const batch = writeBatch(db);
  batch.delete(docRef);

  const parentId = (existingData.parentId as string | null) ?? null;

  if (parentId === null) {
    // 루트(부모) 삭제: 하위 할 일을 함께 삭제해 고아 문서를 남기지 않는다.
    const childrenSnapshot = await getDocs(
      query(todosRef, where("userId", "==", userId), where("parentId", "==", id)),
    );
    childrenSnapshot.docs.forEach((d) => {
      batch.delete(d.ref);
    });
  } else {
    // 하위 할 일 삭제: 남은 형제들 기준으로 상위 상태를 재계산한다.
    // 단, 남은 형제가 0명이면 calcParentStatus([])가 every()의 빈 배열 특성상
    // 무조건 "done"을 반환하는 부작용이 있으므로 상위 상태를 건드리지 않는다.
    const siblingsSnapshot = await getDocs(
      query(todosRef, where("userId", "==", userId), where("parentId", "==", parentId)),
    );
    const remainingSiblings = siblingsSnapshot.docs
      .filter((d) => d.id !== id)
      .map((d) => mapDocToTodo(d.id, d.data()));

    if (remainingSiblings.length > 0) {
      const { status, doneAt } = calcParentStatus(remainingSiblings);
      batch.update(doc(db, "todos", parentId), {
        status,
        doneAt,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  await batch.commit();
};

export const updateToDone = async (id: string) => {
  const userId = getUserId();
  const now = new Date().toISOString();
  const docRef = doc(db, "todos", id);
  const existing = await getDoc(docRef);
  if (!existing.exists()) throw new Error("Todo not found");
  if (existing.data().userId !== userId) throw new Error("Forbidden");
  await updateDoc(docRef, { status: "done", doneAt: now, updatedAt: now });
  return mapDocToTodo(docRef.id, { ...existing.data(), status: "done", doneAt: now, updatedAt: now });
};

export const updateTodoDueAt = async (
  id: string,
  dueAt: string | null,
  startAt?: string | null,
): Promise<void> => {
  const userId = getUserId();
  const now = new Date().toISOString();
  const docRef = doc(db, "todos", id);
  const existing = await getDoc(docRef);
  if (!existing.exists()) throw new Error("Todo not found");
  if (existing.data().userId !== userId) throw new Error("Forbidden");
  const updates: { dueAt: string | null; updatedAt: string; startAt?: string | null } = {
    dueAt,
    updatedAt: now,
  };
  if (startAt !== undefined) {
    updates.startAt = startAt;
  }
  await updateDoc(docRef, updates);
};

/**
 * 칸반 보드 같은 컬럼(status) 내 드래그 재정렬 시 여러 문서의 order를 한 번에 반영한다.
 * 호출부(useKanbanDrag)가 이미 변경된 문서만 diff해서 넘기므로, 여기서는 추가 필터링 없이
 * 그대로 batch write한다. 개별 getDoc 소유권 재검증은 생략한다 — id 목록은 항상 호출자가
 * getTodos()(userId 필터링됨)로 이미 받아둔 자신의 캐시에서만 나오고, 최종 방어선은
 * firestore.rules의 `resource.data.userId == request.auth.uid`(update 규칙)이므로 카드
 * 수만큼 getDoc 왕복을 추가하는 비용이 정당화되지 않는다. writeBatch는 원자적이라 그
 * 전제가 깨지는 경우(예: 다른 탭에서 그 사이 삭제된 문서)에도 부분 쓰기로 데이터가
 * 어긋나진 않는다 — 다만 이때 에러는 다른 함수들의 "Forbidden"/"Todo not found"가 아니라
 * Firestore의 raw permission-denied로 표면화된다.
 *
 * 읽기 없이 절대 order 값을 그대로 덮어쓰므로, 두 탭/기기에서 같은 컬럼을 거의 동시에
 * 재정렬하면 나중에 commit된 batch가 이긴다(last-write-wins). 값이 사라지는 데이터
 * 유실은 아니고 "방금 옮긴 순서가 다른 기기의 조작에 덮어써질 수 있다" 정도라, 이
 * 코드베이스가 반복 시리즈 등에서 이미 택한 "완전한 원자성 대신 최종 수렴" 철학과
 * 일치하는 트레이드오프로 판단해 트랜잭션을 쓰지 않았다.
 */
export const reorderTodos = async (
  updates: TodoReorderUpdate[],
): Promise<void> => {
  getUserId();
  if (updates.length === 0) return;

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  updates.forEach(({ id, order }) => {
    batch.update(doc(db, "todos", id), { order, updatedAt: now });
  });
  await batch.commit();
};

export const createChildTodo = async (
  parentId: string,
  todo: Partial<Todo>,
  allTodos: Todo[],
) => {
  assertValidTodoDates({ startAt: todo.startAt ?? null, dueAt: todo.dueAt ?? null });
  const userId = getUserId();
  const now = new Date().toISOString();

  const existingSiblings = allTodos.filter((t) => t.parentId === parentId);
  const maxOrder = existingSiblings.reduce(
    (max, t) => Math.max(max, t.order ?? 0),
    -1,
  );

  // 하위 할 일은 반복 설정 대상이 아니다(상호 배제 원칙). 호출부가 실수로 recurrence를
  // 채워 넘기더라도 데이터 레이어에서 항상 강제로 null 처리해 방어한다.
  const docRef = await addDoc(todosRef, {
    ...todo,
    parentId,
    userId,
    createdAt: now,
    updatedAt: now,
    status: "todo",
    order: maxOrder + 1,
    recurrence: null,
    recurrenceId: null,
    archived: false,
  });

  // 새 하위(todo) 추가 → 상위 상태 재계산
  const newChild = { id: docRef.id, status: "todo" as const, parentId } as Todo;
  const siblings = [...existingSiblings, newChild];
  const { status: parentStatus, doneAt } = calcParentStatus(siblings);
  await updateDoc(doc(db, "todos", parentId), {
    status: parentStatus,
    doneAt,
    updatedAt: now,
  });

  return { ...todo, id: docRef.id, parentId } as Todo;
};

/** 인증된 사용자의 루트(parentId === null) 할 일 중 다음에 쓸 order 값을 계산한다. */
const getNextRootOrder = async (userId: string): Promise<number> => {
  const rootTodosSnapshot = await getDocs(
    query(todosRef, where("userId", "==", userId), where("parentId", "==", null)),
  );
  const maxOrder = rootTodosSnapshot.docs.reduce(
    (max, d) => Math.max(max, (d.data().order as number) ?? 0),
    -1,
  );
  return maxOrder + 1;
};

export interface PlanTodoInput {
  title: string;
  /** "yyyy-MM-dd" 로컬 날짜 키 또는 null */
  dueDate: string | null;
  priority: Todo["priority"];
}

export interface PlanSubmission {
  parent: PlanTodoInput;
  children: PlanTodoInput[];
}

/**
 * AI 플랜 미리보기에서 사용자가 편집을 마친 초안을 저장한다. 상위 1개와 하위 N개를
 * writeBatch 한 번으로 만든다. createTodo 후 createChildTodo를 N번 부르면 중간 실패 시
 * "하위가 반쯤만 있는 플랜"이 남기 때문이다. 상위 문서 id는 doc(todosRef)로 미리 만들어
 * 하위의 parentId에 넣는다. 전부 "todo"로 시작하므로 상위 상태 재계산은 필요 없다.
 * startAt이 모두 null이라 assertValidTodoDates(startAt ≤ dueAt)는 항상 만족한다.
 */
export const createPlanTodos = async (
  submission: PlanSubmission,
): Promise<{ parentId: string; count: number }> => {
  if (submission.children.length === 0) {
    throw new Error("AI 플랜에는 하위 할 일이 1개 이상 필요합니다");
  }
  const userId = getUserId();
  const now = new Date().toISOString();
  const base = {
    userId,
    status: "todo" as const,
    startAt: null,
    doneAt: null,
    recurrence: null,
    recurrenceId: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  const parentRef = doc(todosRef);
  const parentOrder = await getNextRootOrder(userId);
  const batch = writeBatch(db);

  batch.set(parentRef, {
    ...base,
    title: submission.parent.title,
    priority: submission.parent.priority,
    dueAt: localDateKeyToISO(submission.parent.dueDate),
    parentId: null,
    order: parentOrder,
  });

  submission.children.forEach((child, index) => {
    batch.set(doc(todosRef), {
      ...base,
      title: child.title,
      priority: child.priority,
      dueAt: localDateKeyToISO(child.dueDate),
      parentId: parentRef.id,
      order: index,
    });
  });

  await batch.commit();
  return { parentId: parentRef.id, count: submission.children.length + 1 };
};

/**
 * 반복 규칙이 설정된 할 일을 저장한다. 구현은 packages/core(createRecurringTodo)에 있고,
 * 웹은 db와 현재 uid만 주입한다. 시리즈 잠금도 core 쪽에서 건다.
 */
export const createRecurringTodo = async (
  todo: Todo,
  horizonEnd: Date = getDefaultHorizonEnd(),
): Promise<Todo[]> => {
  const userId = getUserId();
  return (await coreCreateRecurringTodo(db, userId, todo, horizonEnd)) as Todo[];
};

/**
 * 반복 시리즈 전체 수정(done/doing/overdue 보존, 미래 todo만 삭제·재생성).
 * 구현은 packages/core(editRecurringSeries)에 있고, 웹은 db와 현재 uid만 주입한다.
 */
export const editRecurringSeries = async (
  seriesTodo: Todo,
  horizonEnd: Date = getDefaultHorizonEnd(),
): Promise<void> => {
  const userId = getUserId();
  await coreEditRecurringSeries(db, userId, seriesTodo, horizonEnd);
};

/**
 * 반복 시리즈 전체 삭제(상태와 무관하게 같은 recurrenceId의 모든 인스턴스).
 * 구현은 packages/core(deleteRecurringSeries)에 있고, 웹은 db와 현재 uid만 주입한다.
 */
export const deleteRecurringSeries = async (recurrenceId: string): Promise<void> => {
  const userId = getUserId();
  await coreDeleteRecurringSeries(db, userId, recurrenceId);
};

/** 사용자의 Todo 전체를 한 번 읽는다. archived 문서도 포함한다 — 반복 시리즈의 마지막
 *  인스턴스가 archived된 경우 그걸 빼고 계산하면 이미 지난 날짜를 다시 만들어낸다.
 *  insights 피처의 getAllTodosForStats()도 같은 이유(통계에 아카이브 이력 필요)로
 *  이 함수를 그대로 재사용한다. */
export const fetchAllUserTodos = async (userId: string): Promise<Todo[]> => {
  const snapshot = await getDocs(query(todosRef, where("userId", "==", userId)));
  return snapshot.docs.map((d) => mapDocToTodo(d.id, d.data()));
};

/**
 * 앱 진입 시 1회 실행되는 백그라운드 유지보수(App.tsx). 구현은 packages/core에 있고,
 * 웹은 db·uid와 실패 보고(console + Sentry)만 주입한다. 반환값은 실제로 쓴 문서 수다.
 */
export const runStartupMaintenance = async (
  cutoffDays: number = 30,
  horizonEnd: Date = getDefaultHorizonEnd(),
): Promise<number> => {
  const { written } = await coreRunStartupMaintenance(db, getUserId(), {
    cutoffDays,
    horizonEnd,
    onSweepError: (error, sweep) => {
      console.error(`앱 진입 유지보수 실패 (${sweep}):`, error);
      Sentry.captureException(error, { tags: { sweep } });
    },
  });
  return written;
};
