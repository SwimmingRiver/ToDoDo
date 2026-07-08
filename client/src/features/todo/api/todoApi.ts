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
import { db, auth } from "@/shared/lib/firebase";
import { toDateKeyFromISO } from "@/shared/utils/date";
import type { RecurrenceRule, Todo } from "../types/todo.type";
import { generateRecurringDueDates, getDefaultHorizonEnd } from "../utils/recurrence";

const todosRef = collection(db, "todos");

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  return user.uid;
};

const mapDocToTodo = (id: string, data: Record<string, unknown>): Todo =>
  ({ id, ...data }) as Todo;

/**
 * 반복 인스턴스 문서 ID를 {recurrenceId}_{YYYY-MM-DD}로 결정론적으로 만든다(로컬 타임존
 * 기준 연-월-일 — 코드베이스 전반의 toDateString() 기반 "같은 날짜" 판정과 동일 기준).
 *
 * createRecurringTodo/editRecurringSeries/extendIndefiniteRecurringSeries는 서로 다른
 * 탭·기기에서 겹쳐 실행될 수 있는데(withRecurringSeriesLock은 탭 내부만 직렬화), 인스턴스를
 * 매번 새 자동생성 ID로 만들면 같은 recurrenceId·같은 날짜에 대해 두 문서가 동시에 생성될 수
 * 있다. ID 자체를 recurrenceId+날짜로 고정하면 Firestore 문서 ID의 유일성이 곧 "같은
 * 날짜엔 항상 같은 문서"를 보장하므로, 여러 곳에서 동시에 써도(batch.set은 없으면 생성,
 * 있으면 덮어쓰는 upsert) 마지막에 커밋된 내용으로 수렴할 뿐 중복 문서가 생기지 않는다.
 */
const buildRecurringInstanceId = (recurrenceId: string, dueAt: string): string =>
  `${recurrenceId}_${toDateKeyFromISO(dueAt)}`;

/**
 * 반복 시리즈를 읽고(getDocs) 판단한 뒤 batch로 쓰는 함수들(createRecurringTodo,
 * editRecurringSeries, deleteRecurringSeries, extendIndefiniteRecurringSeries)은 트랜잭션으로
 * 묶여있지 않다. 이 함수들이 겹쳐 실행되면(예: 앱 마운트 시 백그라운드로 도는
 * extendIndefiniteRecurringSeries와 사용자가 그 사이에 실행하는 editRecurringSeries) 서로
 * 상대방의 쓰기를 반영하지 못한 stale 스냅샷을 기준으로 각자 커밋해서, 같은 recurrenceId의
 * 같은 날짜에 문서가 중복 생성되는 문제가 있었다. 완전한 원자성 대신, 이 함수들을 항상 하나씩
 * 순서대로만 실행되게 직렬화해 겹쳐 실행 자체를 막는다.
 */
let recurringSeriesMutex: Promise<unknown> = Promise.resolve();

const withRecurringSeriesLock = <T>(run: () => Promise<T>): Promise<T> => {
  const result = recurringSeriesMutex.then(run, run);
  recurringSeriesMutex = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

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

export const getTodos = async () => {
  const userId = getUserId();
  const q = query(todosRef, where("userId", "==", userId));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((doc) => mapDocToTodo(doc.id, doc.data()))
    .sort((a, b) => a.order - b.order);
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
  });
  return { ...todo, id: docRef.id };
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

export const editTodo = async (todo: Todo, allTodos: Todo[]) => {
  assertNoRecurrenceParentConflict(todo);
  const userId = getUserId();
  const { id, ...data } = todo;
  const now = new Date().toISOString();

  const docRef = doc(db, "todos", id);
  const existing = await getDoc(docRef);
  if (!existing.exists()) throw new Error("Todo not found");
  if (existing.data().userId !== userId) throw new Error("Forbidden");

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

export const createChildTodo = async (
  parentId: string,
  todo: Partial<Todo>,
  allTodos: Todo[],
) => {
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

/**
 * 반복 규칙이 설정된 할 일을 저장한다. generateRecurringDueDates로 계산한 dueAt마다
 * 하나씩 Todo 문서를 batch 생성하고, 모두 동일한 recurrenceId(신규 Firestore 문서 id)를
 * 부여해 같은 시리즈로 묶는다. 개별 인스턴스는 status: "todo"로 시작한다.
 */
export const createRecurringTodo = (
  todo: Todo,
  horizonEnd: Date = getDefaultHorizonEnd(),
): Promise<Todo[]> => withRecurringSeriesLock(() => createRecurringTodoImpl(todo, horizonEnd));

const createRecurringTodoImpl = async (
  todo: Todo,
  horizonEnd: Date,
): Promise<Todo[]> => {
  const userId = getUserId();
  if (todo.parentId) {
    throw new Error("하위 할 일은 반복 설정을 가질 수 없습니다");
  }
  if (!todo.recurrence) {
    throw new Error("recurrence가 없는 할 일은 createRecurringTodo로 생성할 수 없습니다");
  }
  if (!todo.startAt) {
    throw new Error("반복 할 일은 startAt(시작일시)이 필요합니다");
  }

  const now = new Date().toISOString();
  const recurrenceId = doc(todosRef).id;
  const dueDates = generateRecurringDueDates(todo.startAt, todo.recurrence, horizonEnd);

  // 마감일이 반복 생성 호라이즌(horizonEnd)을 넘어서면 생성 가능한 발생일이 하나도 없다.
  // 조용히 0개를 커밋하고 성공한 것처럼 보이면 사용자는 일정이 생겼다고 착각하므로,
  // commit 전에 명시적으로 실패시킨다.
  if (dueDates.length === 0) {
    throw new Error(
      "설정한 마감일이 반복 생성 가능 기간을 벗어나 일정을 생성할 수 없습니다. 마감일을 더 가깝게 설정해주세요.",
    );
  }

  let nextOrder = await getNextRootOrder(userId);
  const { id: _id, ...todoData } = todo;

  const batch = writeBatch(db);
  const created: Todo[] = [];

  for (const dueAt of dueDates) {
    const newDocRef = doc(db, "todos", buildRecurringInstanceId(recurrenceId, dueAt));
    const instanceData = {
      ...todoData,
      userId,
      // 인스턴스별 startAt도 그 발생일(dueAt과 같은 날짜) + 원래 startAt의 시:분으로 갱신한다.
      // generateRecurringDueDates가 이미 todo.startAt을 앵커로 시:분을 적용해 dueAt을
      // 계산하므로(applyTimeOfDay), dueAt 자체가 "발생일 + 원래 startAt 시각"이다 — 원본
      // todoData.startAt(모든 인스턴스에 동일한 고정값)을 그대로 물려받으면 calendar.tsx가
      // startAt~dueAt을 다중일 span으로 잘못 렌더링하는 회귀가 생긴다.
      startAt: dueAt,
      dueAt,
      status: "todo" as const,
      doneAt: null,
      parentId: null,
      recurrenceId,
      createdAt: now,
      updatedAt: now,
      order: nextOrder,
    };
    batch.set(newDocRef, instanceData);
    created.push({ ...instanceData, id: newDocRef.id });
    nextOrder += 1;
  }

  await batch.commit();
  return created;
};

/**
 * 반복 시리즈 전체 수정. 입력은 시리즈 대표 todo(수정 폼에서 편집 중인 인스턴스)의
 * 새 필드값 + 새 recurrence 규칙이다 (recurrence가 null이면 반복 OFF 전환).
 *
 * 같은 recurrenceId를 가진 모든 인스턴스를 조회한 뒤 3단 분기로 처리한다:
 *  1) status가 "done" 또는 "doing" → 그대로 보존 (필드 값 포함 전혀 건드리지 않음)
 *  2) status가 "todo"이고 dueAt < 오늘(지난 미완료 = overdue) → 그대로 보존
 *  3) status가 "todo"이고 dueAt >= 오늘(미래) → 삭제 후, 새 규칙/새 필드값으로 재생성
 *     (재생성 시작 기준일은 새 dueAt부터 horizonEnd까지, 오늘 이전 발생일은 제외)
 *
 * recurrence를 null로 바꿔 반복을 끄는 저장도 동일한 3단 분기를 따른다: done/doing/overdue는
 * 그대로 두고, 미래 "todo" 인스턴스만 재생성 없이 완전히 삭제한다(문서 자체가 사라지므로
 * recurrenceId도 함께 사라진다).
 */
export const editRecurringSeries = (
  seriesTodo: Todo,
  horizonEnd: Date = getDefaultHorizonEnd(),
): Promise<void> => withRecurringSeriesLock(() => editRecurringSeriesImpl(seriesTodo, horizonEnd));

const editRecurringSeriesImpl = async (
  seriesTodo: Todo,
  horizonEnd: Date,
): Promise<void> => {
  const userId = getUserId();
  const { recurrenceId } = seriesTodo;
  if (!recurrenceId) {
    throw new Error("recurrenceId가 없는 할 일은 시리즈 전체 수정을 할 수 없습니다");
  }
  if (seriesTodo.parentId) {
    throw new Error("하위 할 일은 반복 시리즈를 가질 수 없습니다");
  }

  const now = new Date().toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const seriesSnapshot = await getDocs(
    query(
      todosRef,
      where("userId", "==", userId),
      where("recurrenceId", "==", recurrenceId),
    ),
  );
  const seriesTodos = seriesSnapshot.docs.map((d) => mapDocToTodo(d.id, d.data()));

  const batch = writeBatch(db);

  // done/doing/overdue(todo && dueAt < 오늘) 인스턴스는 삭제 대상에서 제외(그대로 보존).
  // todo && dueAt >= 오늘 인 미래 인스턴스만 삭제 대상.
  const toDelete = seriesTodos.filter((t) => {
    if (t.status === "done" || t.status === "doing") return false;
    if (!t.dueAt) return false; // dueAt 없는 todo 상태 인스턴스는 방어적으로 보존
    return new Date(t.dueAt).getTime() >= todayStart.getTime();
  });

  toDelete.forEach((t) => {
    batch.delete(doc(db, "todos", t.id));
  });

  // toDelete에 포함되지 않아 그대로 남는(done/doing/overdue) 인스턴스가 이미 점유한
  // 날짜는 재생성 대상에서 제외해야 한다. 그러지 않으면 예를 들어 오늘 인스턴스를
  // "doing"으로 표시해둔 채 시리즈를 수정할 때, 보존된 오늘자 문서는 그대로 두고
  // 재생성 로직이 같은 오늘 날짜에 새 todo 문서를 하나 더 만들어 캘린더/목록에
  // 같은 날짜가 중복으로 표시되는 문제가 생긴다.
  const toDeleteIds = new Set(toDelete.map((t) => t.id));
  const preservedDateKeys = new Set(
    seriesTodos
      .filter((t) => !toDeleteIds.has(t.id) && t.dueAt)
      .map((t) => new Date(t.dueAt as string).toDateString()),
  );

  // 지금 수정 중인 인스턴스 자신이 "doing" 또는 overdue(todo && dueAt < 오늘)라서
  // 위 toDelete에서 보존 대상으로 빠졌다면, 그 문서는 삭제/재생성되지 않아 사용자가
  // 방금 입력한 수정 내용(제목/설명/마감일 등)이 반영될 곳이 없다. 이 문서만 예외적으로
  // 직접 갱신한다. status/doneAt은 원본을 그대로 유지해 진행 상태를 잃지 않는다.
  // done 인스턴스(이미 완료된 과거 기록)는 대상에서 제외 — 완료된 회차는 그대로 보존한다.
  const editedOriginal = seriesTodos.find((t) => t.id === seriesTodo.id);
  const editedIsPreserved =
    !!editedOriginal &&
    (editedOriginal.status === "doing" ||
      (editedOriginal.status === "todo" &&
        !!editedOriginal.dueAt &&
        new Date(editedOriginal.dueAt).getTime() < todayStart.getTime()));

  if (editedIsPreserved) {
    if (seriesTodo.dueAt) {
      // 다른 보존된(done/doing/overdue) 형제 인스턴스가 이미 점유한 날짜로 마감일을
      // 옮기면, 그 문서와 지금 갱신하는 문서가 같은 날짜에 공존해 캘린더 중복이
      // 재현되므로 미리 막는다.
      const newDateKey = new Date(seriesTodo.dueAt).toDateString();
      const collidesWithOtherPreserved = seriesTodos.some(
        (t) =>
          t.id !== seriesTodo.id &&
          !toDeleteIds.has(t.id) &&
          !!t.dueAt &&
          new Date(t.dueAt).toDateString() === newDateKey,
      );
      if (collidesWithOtherPreserved) {
        throw new Error(
          "이미 다른 인스턴스가 있는 날짜로는 마감일을 변경할 수 없습니다",
        );
      }
    }

    const {
      id: _editedId,
      recurrenceId: _editedRid,
      status: _s,
      doneAt: _d,
      userId: _uid,
      ...editableRest
    } = seriesTodo;
    batch.update(doc(db, "todos", seriesTodo.id), { ...editableRest, userId, updatedAt: now });
    if (seriesTodo.dueAt) {
      preservedDateKeys.add(new Date(seriesTodo.dueAt).toDateString());
    }
  }

  const newRecurrence = seriesTodo.recurrence;

  if (newRecurrence) {
    if (!seriesTodo.startAt) {
      throw new Error("반복 할 일은 startAt(시작일시)이 필요합니다");
    }

    // 오늘 이후 첫 유효 발생일부터 horizonEnd까지 새 규칙으로 재생성하되, 이미 보존된
    // 인스턴스가 점유한 날짜는 건너뛴다.
    const dueDates = generateRecurringDueDates(
      seriesTodo.startAt,
      newRecurrence,
      horizonEnd,
    )
      .filter((iso) => new Date(iso).getTime() >= todayStart.getTime())
      .filter((iso) => !preservedDateKeys.has(new Date(iso).toDateString()));

    // 새 마감일이 호라이즌을 벗어나 재생성할 발생일이 하나도 없으면, 여기서(commit 전에)
    // 명시적으로 실패시킨다. 위 batch.delete/batch.set은 스테이징일 뿐 commit 전에는
    // Firestore에 반영되지 않으므로, 이 throw로 시리즈 삭제 자체가 취소되어 기존 미래
    // 인스턴스가 소실되지 않는다.
    if (dueDates.length === 0) {
      throw new Error(
        "설정한 마감일이 반복 생성 가능 기간을 벗어나 일정을 생성할 수 없습니다. 마감일을 더 가깝게 설정해주세요.",
      );
    }

    let nextOrder = await getNextRootOrder(userId);
    const { id: _id, recurrenceId: _rid, ...rest } = seriesTodo;

    dueDates.forEach((dueAt) => {
      const newDocRef = doc(db, "todos", buildRecurringInstanceId(recurrenceId, dueAt));
      batch.set(newDocRef, {
        ...rest,
        userId,
        // createRecurringTodoImpl과 동일한 이유: 인스턴스별 startAt을 원본 시리즈의 고정값
        // 그대로 물려받지 않고 발생일(dueAt)로 갱신한다.
        startAt: dueAt,
        dueAt,
        status: "todo",
        doneAt: null,
        parentId: null,
        recurrenceId,
        createdAt: now,
        updatedAt: now,
        order: nextOrder,
      });
      nextOrder += 1;
    });
  }
  // newRecurrence === null: 반복 OFF 전환. 미래 인스턴스는 위 toDelete에서 이미 삭제
  // 대상에 포함되었고, 재생성하지 않는다.

  await batch.commit();
};

/**
 * 반복 시리즈 전체 삭제. editRecurringSeries(부분 수정)와 달리, 사용자가 명시적으로
 * "삭제"를 선택한 경우이므로 done/doing/overdue를 보존하지 않고 같은 recurrenceId를
 * 가진 모든 인스턴스를 예외 없이 삭제한다.
 */
export const deleteRecurringSeries = (recurrenceId: string): Promise<void> =>
  withRecurringSeriesLock(() => deleteRecurringSeriesImpl(recurrenceId));

const deleteRecurringSeriesImpl = async (recurrenceId: string): Promise<void> => {
  const userId = getUserId();

  const seriesSnapshot = await getDocs(
    query(
      todosRef,
      where("userId", "==", userId),
      where("recurrenceId", "==", recurrenceId),
    ),
  );

  const batch = writeBatch(db);
  seriesSnapshot.docs.forEach((d) => {
    batch.delete(d.ref);
  });
  await batch.commit();
};

/**
 * "무기한(indefinite)" 반복 시리즈들의 남은 인스턴스를, 오늘 기준 새 호라이즌
 * (getDefaultHorizonEnd)까지 이어서 생성한다. 기존 인스턴스는 전혀 건드리지 않고
 * 마지막 인스턴스 이후의 빈 구간만 채운다 — 앱 진입 시(App.tsx) 1회 호출해서,
 * 사용자가 앱을 계속 쓰는 한 "무기한"이 실제로 끊기지 않게 한다.
 *
 * 종료 조건이 "특정 날짜까지(untilDate)"인 시리즈는 대상이 아니다(이미 끝이
 * 정해져 있어 확장이 필요 없음). 종료 조건이 없는(recurrence: null, 반복
 * OFF) 일반 할 일도 당연히 대상이 아니다.
 */
export const extendIndefiniteRecurringSeries = (
  horizonEnd: Date = getDefaultHorizonEnd(),
): Promise<void> => withRecurringSeriesLock(() => extendIndefiniteRecurringSeriesImpl(horizonEnd));

const extendIndefiniteRecurringSeriesImpl = async (horizonEnd: Date): Promise<void> => {
  const userId = getUserId();
  const q = query(todosRef, where("userId", "==", userId));
  const snapshot = await getDocs(q);
  const allTodos = snapshot.docs.map((d) => mapDocToTodo(d.id, d.data()));

  const seriesByRecurrenceId = new Map<string, Todo[]>();
  for (const todo of allTodos) {
    if (!todo.recurrenceId || !todo.recurrence) continue;
    if (todo.recurrence.endType !== "indefinite") continue;
    if (!todo.dueAt) continue;
    const list = seriesByRecurrenceId.get(todo.recurrenceId) ?? [];
    list.push(todo);
    seriesByRecurrenceId.set(todo.recurrenceId, list);
  }

  if (seriesByRecurrenceId.size === 0) return;

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  let hasWrites = false;

  // batch가 커밋되기 전에는 새 인스턴스가 Firestore에 반영되지 않아, 시리즈마다
  // getNextRootOrder를 호출하면 매번 같은 maxOrder를 읽어 서로 다른 시리즈의 새
  // 인스턴스들이 중복된 order를 받는다. 그래서 루프 전체가 하나의 nextOrder를 공유하며
  // 실제로 쓴 만큼만 증가시킨다. 단, 이 함수는 앱 진입 시마다 실행되고 대부분의 경우
  // 확장할 것이 없으므로, 첫 쓰기가 필요해지는 시점에 한 번만 지연 조회한다
  // (생성할 것이 없으면 getNextRootOrder용 추가 조회도 발생하지 않아야 한다).
  let sharedNextOrder: number | null = null;

  for (const [recurrenceId, instances] of seriesByRecurrenceId) {
    const latest = instances.reduce((a, b) =>
      new Date(a.dueAt as string).getTime() > new Date(b.dueAt as string).getTime() ? a : b,
    );
    const latestTime = new Date(latest.dueAt as string).getTime();
    if (latestTime >= horizonEnd.getTime()) continue; // 이미 새 호라이즌까지 채워져 있음

    const rule = latest.recurrence as RecurrenceRule;
    // 멀티탭 등에서 이미 존재하는 날짜를 다시 만들지 않도록 최소한의 존재 체크를 한다.
    const existingDateKeys = new Set(
      instances.map((t) => new Date(t.dueAt as string).toDateString()),
    );
    const newDueDates = generateRecurringDueDates(latest.dueAt as string, rule, horizonEnd)
      .filter((iso) => new Date(iso).getTime() > latestTime)
      .filter((iso) => !existingDateKeys.has(new Date(iso).toDateString()));

    if (newDueDates.length === 0) continue;

    if (sharedNextOrder === null) {
      sharedNextOrder = await getNextRootOrder(userId);
    }
    let nextOrder: number = sharedNextOrder;

    // 가장 최근 인스턴스의 제목/우선순위 등 필드를 그대로 이어서 사용한다(기존 값 승계).
    const { id: _id, ...rest } = latest;

    newDueDates.forEach((dueAt) => {
      const newDocRef = doc(db, "todos", buildRecurringInstanceId(recurrenceId, dueAt));
      batch.set(newDocRef, {
        ...rest,
        userId,
        // createRecurringTodoImpl과 동일한 이유: rest(마지막 인스턴스 필드 승계)에 담긴
        // startAt은 latest 인스턴스 자신의 발생일 기준 값이라 새로 만드는 인스턴스에는
        // 맞지 않으므로, 매번 그 인스턴스의 발생일(dueAt)로 덮어쓴다.
        startAt: dueAt,
        dueAt,
        status: "todo",
        doneAt: null,
        parentId: null,
        recurrenceId,
        createdAt: now,
        updatedAt: now,
        order: nextOrder,
      });
      nextOrder += 1;
      hasWrites = true;
    });

    sharedNextOrder = nextOrder;
  }

  if (hasWrites) {
    await batch.commit();
  }
};
