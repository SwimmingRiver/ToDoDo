import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { parseDateKey, toDateKeyFromISO } from "../insights/date";
import type { RecurrenceRule, Todo } from "../types/todo";
import {
  buildRecurringInstanceId,
  buildRecurringOccurrenceDoc,
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

/** 두 반복 규칙이 같은지. 저장 문서엔 endDate/weekdays 키가 없을 수 있어 없음을 null/[]로 맞춘다. */
const isSameRecurrenceRule = (
  a: RecurrenceRule | null | undefined,
  b: RecurrenceRule,
): boolean => {
  if (!a) return false;
  const weekdaysKey = (r: RecurrenceRule) =>
    r.type === "weekly" ? [...(r.weekdays ?? [])].sort((x, y) => x - y).join(",") : "";
  return (
    a.type === b.type &&
    a.endType === b.endType &&
    (a.endType === "untilDate" ? (a.endDate ?? null) === (b.endDate ?? null) : true) &&
    weekdaysKey(a) === weekdaysKey(b)
  );
};

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
  const batch = writeBatch(db);
  const created: Todo[] = [];

  for (const dueAt of dueDates) {
    const newDocRef = doc(db, "todos", buildRecurringInstanceId(recurrenceId, dueAt));
    // 회차별 필드 정리(googleEventId 제외, archived/overdueArchived 초기화 등)는 공용 빌더가 맡는다.
    const instanceData = buildRecurringOccurrenceDoc(todo, {
      userId,
      recurrenceId,
      dueAt,
      now,
      order: nextOrder,
    });
    batch.set(newDocRef, instanceData);
    created.push({ ...instanceData, id: newDocRef.id });
    nextOrder += 1;
  }

  await batch.commit();
  return created;
};

/**
 * 반복 시리즈 수정("이 회차와 이후 회차"). 입력은 수정 폼에서 편집 중인 회차의
 * 새 필드값 + 새 recurrence 규칙이다 (recurrence가 null이면 반복 OFF 전환).
 *
 * 창 시작 = max(수정 회차의 저장된 날짜, 오늘). 같은 recurrenceId를 가진 모든 인스턴스를
 * 조회한 뒤 3단 분기로 처리한다:
 *  1) status가 "done" 또는 "doing" → 그대로 보존 (필드 값 포함 전혀 건드리지 않음)
 *  2) status가 "todo"이고 dueAt < 창 시작(지난 미완료 overdue, 수정 회차보다 앞선 회차)
 *     → 그대로 보존
 *  3) status가 "todo"이고 dueAt >= 창 시작 → 삭제 후, 새 규칙/새 필드값으로 재생성
 *     (재생성 시작 기준일은 새 startAt부터 horizonEnd까지, 오늘 이전 발생일과 보존된
 *     회차가 점유한 날짜는 제외)
 *
 * recurrence를 null로 바꿔 반복을 끄는 저장도 동일한 3단 분기를 따른다: 보존 대상은
 * 그대로 두되 반복 규칙만 지우고, 창 안의 "todo" 인스턴스만 재생성 없이 완전히 삭제한다.
 * 단, 지금 수정 중인 회차는(done이 아니면) 삭제하지 않고 수정 내용을 반영한 뒤
 * recurrence/recurrenceId를 null로 끊어 일반 할 일로 남긴다.
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
  // 재생성 0개가 정상이 된 뒤로(종료일 선택), 잘못된 입력도 0개로 계산되어 창 안 todo 회차를
  // 지우기만 하고 아무것도 만들지 않는 조용한 삭제가 된다. 폼 검증을 거치지 않은 호출에
  // 대비해 조회·스테이징 전에 막는다.
  if (seriesTodo.recurrence) {
    if (seriesTodo.recurrence.type === "weekly" && !seriesTodo.recurrence.weekdays?.length) {
      throw new Error("매주 반복은 요일을 하나 이상 선택해야 합니다");
    }
    if (seriesTodo.startAt && Number.isNaN(new Date(seriesTodo.startAt).getTime())) {
      throw new Error("반복 할 일의 시작일시를 해석할 수 없습니다");
    }
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

  // 시리즈 수정은 "이 회차와 이후 회차"에만 적용한다. 삭제·재생성 창의 시작은 수정 중인
  // 회차의 저장된 날짜(로컬 자정)와 오늘 자정 중 늦은 쪽이다. 그 이전 회차는 상태와 무관하게
  // 지우지도 다시 만들지도 않는다 — 그러지 않으면 오늘 시작한 매일 시리즈에서 내일 회차를
  // 고칠 때, 오늘 회차가 지워지고(재생성은 수정 회차 날짜부터라) 다시 생기지 않는다.
  // 기준은 입력(seriesTodo.dueAt, 사용자가 바꿨을 수 있음)이 아니라 저장된 문서의 dueAt이다.
  // 저장된 회차를 못 찾거나 dueAt이 없으면 이전 동작대로 오늘 자정부터로 둔다(정확한 회차
  // 위치를 모를 때 더 이른 쪽으로 넓히는 것이 기존 계약과 같다).
  const editedDayStart = editedOriginal?.dueAt
    ? parseDateKey(toDateKeyFromISO(editedOriginal.dueAt))
    : null;
  const windowStart =
    editedDayStart && editedDayStart.getTime() > todayStart.getTime()
      ? editedDayStart
      : todayStart;

  // done/doing 인스턴스와 창 이전(지난 미완료 overdue, 수정 회차보다 앞선 회차) 인스턴스는
  // 삭제 대상에서 제외(그대로 보존). 창 안의 todo 인스턴스만 삭제 대상.
  const toDelete = seriesTodos.filter((t) => {
    if (keepEditedAsStandalone && t.id === seriesTodo.id) return false;
    if (t.status === "done" || t.status === "doing") return false;
    if (!t.dueAt) return false; // dueAt 없는 todo 상태 인스턴스는 방어적으로 보존
    return new Date(t.dueAt).getTime() >= windowStart.getTime();
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
    // googleEventId는 폼을 연 시점의 값이라, 그 사이 동기화가 기록한 최신 값을 덮어쓸 수 있다
    // — 쓰지 않고 문서에 저장된 값을 그대로 둔다. overdueArchived는 recurrenceId가 끊긴
    // 일반 할 일에는 의미가 없어(collapseRecurringInstances가 보지 않음) 건드리지 않는다.
    const {
      id: _editedId,
      recurrenceId: _editedRid,
      status: _s,
      doneAt: _d,
      userId: _uid,
      googleEventId: _gid,
      overdueArchived: _oa,
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

    // googleEventId·overdueArchived는 폼을 연 시점의 값이라 문서에 저장된 최신 값(동기화가
    // 기록한 이벤트 id, 정리 작업이 세운 숨김)보다 오래됐을 수 있다 — 입력으로는 쓰지 않는다.
    // 다만 숨겨진 회차의 마감일을 오늘 이후로 옮겼다면 더 이상 지난 회차가 아니므로 숨김을
    // 푼다(그대로 두면 목록 대표 후보에서 빠져 할 일이 사라진다). 여전히 지난 날짜면 숨김 유지.
    const {
      id: _editedId,
      recurrenceId: _editedRid,
      status: _s,
      doneAt: _d,
      userId: _uid,
      googleEventId: _gid,
      overdueArchived: _oa,
      ...editableRest
    } = seriesTodo;
    const movedToTodayOrLater =
      !!seriesTodo.dueAt && new Date(seriesTodo.dueAt).getTime() >= todayStart.getTime();
    batch.update(doc(db, "todos", seriesTodo.id), {
      ...editableRest,
      ...(movedToTodayOrLater ? { overdueArchived: false } : {}),
      userId,
      updatedAt: now,
    });
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
    // 반복이 유지되는 저장: 삭제되지 않고 남는 다른 회차(done/doing/overdue)에도 새 규칙을
    // 기록한다. 앱 시작 정리 작업(planIndefiniteExtension)은 dueAt이 가장 늦은 회차의 규칙으로
    // 시리즈를 이어 채우는데, 종료일을 당기면 재생성이 0~몇 개라 가장 늦은 회차가 보존된
    // 회차인 경우가 흔하다 — 그 회차가 옛(무기한) 규칙을 갖고 있으면 끝낸 시리즈가 다음 시작에
    // 호라이즌까지 되살아난다. 수정 회차보다 앞선 회차도 함께 바꾼다: 규칙은 회차별 기록이
    // 아니라 시리즈 메타데이터(비정규화 사본)이고, 연장은 가장 늦은 회차만 보므로 앞선 회차의
    // 규칙이 바뀌어도 그 회차의 상태·날짜에는 영향이 없다. 범위를 수정 회차 이후로 가르는
    // 것보다 "남는 회차는 모두 같은 규칙"이 단순하고 어느 회차가 가장 늦든 안전하다.
    // 제외: 삭제 대상(같은 id로 set될 수 있음), 직접 갱신한 수정 회차(그 update에 이미 새
    // 규칙이 실려 있음 — 같은 문서에 update를 두 번 걸지 않는다), 일반 할 일로 분리한 회차(이
    // 분기에선 해당 없음), 이미 같은 규칙인 회차(불필요한 쓰기 방지).
    seriesTodos
      .filter(
        (t) =>
          !toDeleteIds.has(t.id) &&
          !(editedIsPreserved && t.id === seriesTodo.id) &&
          !isSameRecurrenceRule(t.recurrence, newRecurrence),
      )
      .forEach((t) => {
        batch.update(doc(db, "todos", t.id), { recurrence: newRecurrence, updatedAt: now });
      });

    if (!seriesTodo.startAt) {
      throw new Error("반복 할 일은 startAt(시작일시)이 필요합니다");
    }

    // 오늘 이후 첫 유효 발생일부터 horizonEnd까지 새 규칙으로 재생성하되, 이미 보존된
    // 인스턴스가 점유한 날짜는 건너뛴다. 발생일은 seriesTodo.startAt(보통 수정 회차 날짜)부터
    // 계산되므로 창 이전 날짜는 원래 나오지 않는다. 사용자가 시작일을 수정 회차보다 앞당긴
    // 경우에만 그 사이 날짜가 나오는데, 그때도 남아 있는 앞선 회차가 점유한 날짜는
    // preservedDateKeys로 건너뛰어 중복이 생기지 않는다(앞당긴 날짜 자체는 사용자 의도대로 반영).
    const dueDates = generateRecurringDueDates(
      seriesTodo.startAt,
      newRecurrence,
      horizonEnd,
    )
      .filter((iso) => new Date(iso).getTime() >= todayStart.getTime())
      .filter((iso) => !preservedDateKeys.has(new Date(iso).toDateString()));

    // 재생성할 발생일이 0개일 때의 처리. 시작일시(로컬 날짜)가 호라이즌보다 뒤라서 만들 수
    // 없는 경우만 commit 전에 실패시킨다(9f659ea: 위 batch.delete/batch.set은 스테이징일 뿐
    // commit 전에는 반영되지 않으므로, 이 throw로 시리즈 삭제가 취소되어 기존 미래 인스턴스가
    // 소실되지 않는다). 종료일 선택이 생기면서 그 밖의 0개(종료일이 재생성 창보다 앞서거나
    // 창 안에 해당 요일이 없음)는 정상이다 — 창 안의 todo 회차만 지워지고 새로 만들지 않는다.
    if (dueDates.length === 0) {
      const startDay = new Date(seriesTodo.startAt);
      startDay.setHours(0, 0, 0, 0);
      if (startDay.getTime() > horizonEnd.getTime()) {
        throw new Error(
          "설정한 마감일이 반복 생성 가능 기간을 벗어나 일정을 생성할 수 없습니다. 마감일을 더 가깝게 설정해주세요.",
        );
      }
    }

    let nextOrder = await getNextRootOrder(db, userId);
    dueDates.forEach((dueAt) => {
      const newDocRef = doc(db, "todos", buildRecurringInstanceId(recurrenceId, dueAt));
      batch.set(
        newDocRef,
        buildRecurringOccurrenceDoc(seriesTodo, {
          userId,
          recurrenceId,
          dueAt,
          now,
          order: nextOrder,
        }),
      );
      nextOrder += 1;
    });
  }
  // newRecurrence === null: 반복 OFF 전환. 창 안의 todo 인스턴스는 위 toDelete에서 이미 삭제
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
