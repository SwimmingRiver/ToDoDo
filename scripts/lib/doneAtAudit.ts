/**
 * "완료(done)인데 doneAt이 없는" 할 일 판정. 통계의 완료 추이·스트릭·기한 준수율은 doneAt이 있어야
 * 세고(packages/core/src/insights), 우선순위 분포·완료율은 status만 본다 — 그래서 이런 문서가 있으면
 * 같은 화면에서 숫자가 서로 어긋난다. 이 모듈은 규모와 성격(언제 만들어졌는지, 폴백할 updatedAt이 있는지)을 센다.
 */

/** 판정에 필요한 필드만. 제목·설명은 읽지 않는다. */
export const AUDIT_FIELDS = [
  "userId",
  "status",
  "doneAt",
  "createdAt",
  "updatedAt",
  "parentId",
  "recurrenceId",
  "archived",
] as const;

export type DoneAtState = "missing" | "null" | "empty" | "nonString" | "invalid" | "ok";

export type DoneAtAuditTodo = {
  id: string;
  userId: string | null;
  status: unknown;
  doneAtState: DoneAtState;
  createdAt: string | null;
  updatedAt: string | null;
  isChild: boolean;
  isRecurring: boolean;
  archived: boolean;
};

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && value !== "" && !Number.isNaN(new Date(value).getTime());

const doneAtStateOf = (data: Record<string, unknown>): DoneAtState => {
  if (!("doneAt" in data)) return "missing";
  const v = data.doneAt;
  if (v === null) return "null";
  if (v === "") return "empty";
  if (typeof v !== "string") return "nonString"; // 예: Firestore Timestamp로 저장된 옛 데이터
  return isIsoDate(v) ? "ok" : "invalid";
};

const stringOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export const toAuditTodo = (id: string, data: Record<string, unknown>): DoneAtAuditTodo => ({
  id,
  userId: stringOrNull(data.userId),
  status: data.status,
  doneAtState: doneAtStateOf(data),
  createdAt: stringOrNull(data.createdAt),
  updatedAt: stringOrNull(data.updatedAt),
  isChild: !!data.parentId,
  isRecurring: !!data.recurrenceId,
  archived: data.archived === true,
});

/** "yyyy-MM" (UTC). 날짜가 없거나 깨졌으면 "unknown". 월 단위 분포라 시간대 차이는 무시한다. */
const monthKey = (iso: string | null): string => (isIsoDate(iso) ? new Date(iso).toISOString().slice(0, 7) : "unknown");

const increment = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

const sortedEntries = (map: Map<string, number>): [string, number][] =>
  [...map.entries()].sort(([a], [b]) => a.localeCompare(b));

export const auditDoneAt = (todos: DoneAtAuditTodo[]) => {
  const done = todos.filter((t) => t.status === "done");
  const broken = done.filter((t) => t.doneAtState !== "ok");

  const byState = new Map<string, number>();
  const byCreatedMonth = new Map<string, number>();
  const byUpdatedMonth = new Map<string, number>();
  broken.forEach((t) => {
    increment(byState, t.doneAtState);
    increment(byCreatedMonth, monthKey(t.createdAt));
    increment(byUpdatedMonth, monthKey(t.updatedAt));
  });

  const doneUsers = new Set(done.map((t) => t.userId ?? "(none)"));
  const brokenUsers = new Map<string, number>();
  broken.forEach((t) => increment(brokenUsers, t.userId ?? "(none)"));
  // 사용자별 영향 정도: 그 사용자의 done 중 깨진 비율 분포(전부/절반 이상/일부)
  const doneCountByUser = new Map<string, number>();
  done.forEach((t) => increment(doneCountByUser, t.userId ?? "(none)"));
  let usersAllBroken = 0;
  let usersMostlyBroken = 0;
  brokenUsers.forEach((n, uid) => {
    const total = doneCountByUser.get(uid) ?? n;
    if (n === total) usersAllBroken += 1;
    else if (n * 2 >= total) usersMostlyBroken += 1;
  });

  return {
    totalTodos: todos.length,
    doneTodos: done.length,
    broken: {
      total: broken.length,
      byState: sortedEntries(byState),
      roots: broken.filter((t) => !t.isChild).length,
      children: broken.filter((t) => t.isChild).length,
      recurring: broken.filter((t) => t.isRecurring).length,
      archived: broken.filter((t) => t.archived).length,
      // updatedAt 폴백(선택지 ②)이나 백필(선택지 ①)에 쓸 값이 있는지
      withValidUpdatedAt: broken.filter((t) => isIsoDate(t.updatedAt)).length,
      byCreatedMonth: sortedEntries(byCreatedMonth),
      byUpdatedMonth: sortedEntries(byUpdatedMonth),
      ids: broken.map((t) => t.id),
    },
    users: {
      withDone: doneUsers.size,
      affected: brokenUsers.size,
      allDoneBroken: usersAllBroken,
      halfOrMoreBroken: usersMostlyBroken,
    },
  };
};

/**
 * 백필 계획: done인데 doneAt이 정상이 아닌 문서에 doneAt=updatedAt을 채운다.
 * updatedAt은 완료 이후 수정이 있었다면 실제 완료보다 늦지만, 남아 있는 값 중 가장 가깝다.
 * updatedAt도 깨진 문서는 지어낼 값이 없어 건너뛴다(skipped로 보고).
 */
export const planDoneAtBackfill = (todos: DoneAtAuditTodo[]) => {
  const targets = todos.filter((t) => t.status === "done" && t.doneAtState !== "ok");
  const writes = targets
    .filter((t) => isIsoDate(t.updatedAt))
    .map((t) => ({ id: t.id, doneAt: t.updatedAt as string }));
  const skipped = targets.filter((t) => !isIsoDate(t.updatedAt)).map((t) => t.id);
  return { writes, skipped };
};
