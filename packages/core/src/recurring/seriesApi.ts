import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { RecurrenceRule, Todo } from "../types/todo";
import {
  buildRecurringInstanceId,
  generateRecurringDueDates,
  getDefaultHorizonEnd,
} from "./recurrence";
import { withRecurringSeriesLock } from "./seriesLock";

/**
 * 반복 시리즈 생성·수정 입력. 웹은 폼에서 만든 Todo 전체를 넘기고, 모바일은 필요한
 * 필드만 넘길 수 있도록 나머지 Todo 필드는 optional로 둔다. 런타임은 웹과 동일하게
 * 입력의 나머지 키를 인스턴스 문서에 그대로 펼쳐 넣는다.
 */
export type RecurringTodoInput = {
  id?: string;
  title: string;
  description?: string;
  priority: Todo["priority"];
  startAt: string | null;
  dueAt: string | null;
  parentId: string | null;
  recurrence: RecurrenceRule | null;
  recurrenceId?: string | null;
} & Partial<Omit<Todo, "id">>;

const mapDocToTodo = (id: string, data: Record<string, unknown>): Todo =>
  ({ id, ...data }) as Todo;

/** 인증된 사용자의 루트(parentId === null) 할 일 중 다음에 쓸 order 값을 계산한다. */
const getNextRootOrder = async (db: Firestore, userId: string): Promise<number> => {
  const rootTodosSnapshot = await getDocs(
    query(
      collection(db, "todos"),
      where("userId", "==", userId),
      where("parentId", "==", null),
    ),
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
  db: Firestore,
  userId: string,
  todo: RecurringTodoInput,
  horizonEnd: Date = getDefaultHorizonEnd(),
): Promise<Todo[]> =>
  withRecurringSeriesLock(() => createRecurringTodoImpl(db, userId, todo, horizonEnd));

const createRecurringTodoImpl = async (
  db: Firestore,
  userId: string,
  todo: RecurringTodoInput,
  horizonEnd: Date,
): Promise<Todo[]> => {
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
  const recurrenceId = doc(collection(db, "todos")).id;
  const dueDates = generateRecurringDueDates(todo.startAt, todo.recurrence, horizonEnd);

  // 마감일이 반복 생성 호라이즌(horizonEnd)을 넘어서면 생성 가능한 발생일이 하나도 없다.
  // 조용히 0개를 커밋하고 성공한 것처럼 보이면 사용자는 일정이 생겼다고 착각하므로,
  // commit 전에 명시적으로 실패시킨다.
  if (dueDates.length === 0) {
    throw new Error(
      "설정한 마감일이 반복 생성 가능 기간을 벗어나 일정을 생성할 수 없습니다. 마감일을 더 가깝게 설정해주세요.",
    );
  }

  let nextOrder = await getNextRootOrder(db, userId);
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
      // todoData.startAt(모든 인스턴스에 동일한 고정값)을 그대로 물려받으면 캘린더가
      // startAt~dueAt을 다중일 span으로 잘못 렌더링하는 회귀가 생긴다.
      startAt: dueAt,
      dueAt,
      status: "todo" as const,
      doneAt: null,
      parentId: null,
      archived: false,
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
 * recurrenceId도 함께 사라진다). 단, 지금 수정 중인 회차는(done이 아니면) 삭제하지 않고
 * 수정 내용을 반영한 뒤 recurrence/recurrenceId를 null로 끊어 일반 할 일로 남긴다.
 */
export const editRecurringSeries = (
  db: Firestore,
  userId: string,
  seriesTodo: RecurringTodoInput & { id: string },
  horizonEnd: Date = getDefaultHorizonEnd(),
): Promise<void> =>
  withRecurringSeriesLock(() => editRecurringSeriesImpl(db, userId, seriesTodo, horizonEnd));

const editRecurringSeriesImpl = async (
  db: Firestore,
  userId: string,
  seriesTodo: RecurringTodoInput & { id: string },
  horizonEnd: Date,
): Promise<void> => {
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
      collection(db, "todos"),
      where("userId", "==", userId),
      where("recurrenceId", "==", recurrenceId),
    ),
  );
  const seriesTodos = seriesSnapshot.docs.map((d) => mapDocToTodo(d.id, d.data()));

  const batch = writeBatch(db);

  const editedOriginal = seriesTodos.find((t) => t.id === seriesTodo.id);

  // 반복 OFF 전환이면 지금 수정 중인 회차(완료된 회차 제외)는 시리즈를 떠나 일반 할 일로
  // 남긴다. 그러지 않으면 수정 중인 회차가 오늘/미래 todo일 때 아래 toDelete에 함께 들어가,
  // 사용자 입장에서는 반복을 껐을 뿐인데 할 일이 통째로 사라진다.
  const keepEditedAsStandalone =
    !seriesTodo.recurrence && !!editedOriginal && editedOriginal.status !== "done";

  // done/doing/overdue(todo && dueAt < 오늘) 인스턴스는 삭제 대상에서 제외(그대로 보존).
  // todo && dueAt >= 오늘 인 미래 인스턴스만 삭제 대상.
  const toDelete = seriesTodos.filter((t) => {
    if (keepEditedAsStandalone && t.id === seriesTodo.id) return false;
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
  // 반복 OFF 저장에서는 doing/overdue 회차도 이 분기가 아니라 위 keepEditedAsStandalone
  // 분기(일반 할 일로 분리)를 탄다 — 이 분기는 반복이 유지되는 저장에서만 실행된다.
  const editedIsPreserved =
    !keepEditedAsStandalone &&
    !!editedOriginal &&
    (editedOriginal.status === "doing" ||
      (editedOriginal.status === "todo" &&
        !!editedOriginal.dueAt &&
        new Date(editedOriginal.dueAt).getTime() < todayStart.getTime()));

  if (keepEditedAsStandalone) {
    // 보존 회차 직접 갱신과 같은 필드 처리(진행 상태 status/doneAt은 원본 유지)에 더해
    // recurrence/recurrenceId를 끊어 일반 할 일로 만든다. 시리즈를 떠난 문서이고 재생성도
    // 없으므로, 보존된 형제 회차와 같은 날짜가 되어도 "같은 시리즈의 중복 회차"가 아니다 —
    // 그래서 아래 날짜 충돌 검사는 적용하지 않는다.
    const {
      id: _editedId,
      recurrenceId: _editedRid,
      status: _s,
      doneAt: _d,
      userId: _uid,
      ...editableRest
    } = seriesTodo;
    batch.update(doc(db, "todos", seriesTodo.id), {
      ...editableRest,
      recurrence: null,
      recurrenceId: null,
      userId,
      updatedAt: now,
    });
  } else if (editedIsPreserved) {
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

  if (!newRecurrence) {
    // 반복 OFF: 삭제되지 않고 남는 다른 회차(done/doing/overdue)의 반복 규칙도 지운다.
    // 규칙이 남아 있으면 앱 시작 정리 작업(planIndefiniteExtension)이 recurrenceId로 묶어
    // 무기한 시리즈를 호라이즌까지 다시 채운다 — 꺼진 반복이 되살아나고, 결정론적 문서 ID
    // ({recurrenceId}_{날짜})가 일반 할 일로 남긴 문서와 겹치면 그 문서를 덮어쓴다.
    // recurrenceId는 이력(목록 묶음·배지)용으로 유지하고 다른 필드는 건드리지 않는다.
    // 수정 중인 회차가 done이면 그 회차도 여기서 규칙만 지워진다.
    seriesTodos
      .filter(
        (t) =>
          !toDeleteIds.has(t.id) &&
          !(keepEditedAsStandalone && t.id === seriesTodo.id) &&
          t.recurrence != null,
      )
      .forEach((t) => {
        batch.update(doc(db, "todos", t.id), { recurrence: null, updatedAt: now });
      });
  }

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

    let nextOrder = await getNextRootOrder(db, userId);
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
        archived: false,
        recurrenceId,
        createdAt: now,
        updatedAt: now,
        order: nextOrder,
      });
      nextOrder += 1;
    });
  }
  // newRecurrence === null: 반복 OFF 전환. 미래 인스턴스는 위 toDelete에서 이미 삭제
  // 대상에 포함되었고(수정 중인 회차는 일반 할 일로 남김), 재생성하지 않는다.

  await batch.commit();
};

/**
 * 반복 시리즈 전체 삭제. editRecurringSeries(부분 수정)와 달리, 사용자가 명시적으로
 * "삭제"를 선택한 경우이므로 done/doing/overdue를 보존하지 않고 같은 recurrenceId를
 * 가진 모든 인스턴스를 예외 없이 삭제한다.
 */
export const deleteRecurringSeries = (
  db: Firestore,
  userId: string,
  recurrenceId: string,
): Promise<void> =>
  withRecurringSeriesLock(() => deleteRecurringSeriesImpl(db, userId, recurrenceId));

const deleteRecurringSeriesImpl = async (
  db: Firestore,
  userId: string,
  recurrenceId: string,
): Promise<void> => {
  const seriesSnapshot = await getDocs(
    query(
      collection(db, "todos"),
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
