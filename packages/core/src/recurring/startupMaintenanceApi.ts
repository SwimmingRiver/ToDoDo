import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { Todo } from "../types/todo";
import { getDefaultHorizonEnd } from "./recurrence";
import { withRecurringSeriesLock } from "./seriesLock";
import {
  buildExtensionCreates,
  planArchivedSweep,
  planIndefiniteExtension,
  planOverdueRecurringSweep,
  type ArchiveGroup,
  type TodoCreate,
  type TodoFieldUpdate,
} from "./startupMaintenance";

// Firestore writeBatch는 1건당 최대 500 write까지 허용한다. 신규 기능이 아니라 기존
// 서비스에 소급 적용되는 스윕이라 배포 시점에 이미 30일 넘은 완료 프로젝트가 다수
// 누적돼 있을 수 있으므로, 상한 근처까지 채우지 않고 여유를 둔다(backfillArchivedField.ts
// 스크립트와 동일한 값).
const SWEEP_BATCH_SIZE = 400;

export type SweepName = "archived" | "overdue" | "extension";
export type StartupMaintenanceResult = { written: number; failedSweeps: SweepName[] };
export type StartupMaintenanceOptions = {
  cutoffDays?: number;
  horizonEnd?: Date;
  /** 스윕이 실패해 삼켜질 때 호출된다. 로깅·Sentry는 호출부(웹/앱)가 주입한다. */
  onSweepError?: (error: unknown, sweep: SweepName) => void;
};

const mapDocToTodo = (id: string, data: Record<string, unknown>): Todo =>
  ({ id, ...data }) as Todo;

/** 사용자의 Todo 전체를 한 번 읽는다. archived 문서도 포함한다 — 반복 시리즈의 마지막
 *  인스턴스가 archived된 경우 그걸 빼고 계산하면 이미 지난 날짜를 다시 만들어낸다. */
const fetchAllUserTodos = async (db: Firestore, userId: string): Promise<Todo[]> => {
  const snapshot = await getDocs(query(collection(db, "todos"), where("userId", "==", userId)));
  return snapshot.docs.map((d) => mapDocToTodo(d.id, d.data()));
};

/** 평평한 업데이트 목록을 SWEEP_BATCH_SIZE 단위로 나눠 커밋한다.
 *
 *  반환값은 "실제로 커밋된" 문서 수만 센다. 카운터를 커밋 이후에만 올려 이 함수가 무엇을
 *  세는지 분명히 했지만, **중간 청크가 실패하면 그 값이 밖으로 나가지 못한다** — 예외가
 *  runSweep까지 전파되고 그 스윕은 0으로 집계된다. 앞선 청크가 이미 커밋됐는데도
 *  written에 0이 더해지므로, 그 스윕이 유일한 쓰기였다면 useRunStartupMaintenance가 무효화를 건너뛴다.
 *  즉 방금 쓴 문서가 캐시에 반영되지 않을 수 있다.
 *
 *  알면서 두는 트레이드오프다: 400건을 넘는 쓰기 + 중간 실패라는 조합이 동시에 필요하고,
 *  다음 refetch(staleTime 만료·라우트 이동·재접속)에서 자연히 수렴하며, 유지보수 자체도
 *  다음 접속 때 재시도된다. 부분 성공을 반환하려면 이 함수가 예외를 삼켜야 하는데 그건
 *  "실패한 스윕은 0" 이라는 runSweep의 계약을 흐린다. 카운팅 자체는 기존 동작 그대로이고,
 *  무효화가 이 값에 의존하게 된 것이 이번 변경에서 새로 생긴 결합이라 여기 기록해 둔다. */
const commitUpdates = async (
  db: Firestore,
  updates: TodoFieldUpdate[],
): Promise<number> => {
  let committed = 0;
  for (let i = 0; i < updates.length; i += SWEEP_BATCH_SIZE) {
    const chunk = updates.slice(i, i + SWEEP_BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ id, fields }) => {
      batch.update(doc(db, "todos", id), fields);
    });
    await batch.commit();
    committed += chunk.length;
  }
  return committed;
};

/**
 * 그룹 경계에서만 배치를 나눠 커밋한다. 그룹 도중에 commit하면 한 프로젝트의 자식
 * 일부만 archived되고 나머지는 안 되는 상태가 생긴다. 한 루트가 SWEEP_BATCH_SIZE보다
 * 많은 자식을 갖는 극단적 케이스는 다루지 않는다(이 프로젝트 규모에서 사실상 없다).
 */
const commitArchiveGroups = async (
  db: Firestore,
  groups: ArchiveGroup[],
): Promise<number> => {
  let batch: ReturnType<typeof writeBatch> | null = null;
  let pendingWrites = 0;
  let totalWritten = 0;

  const commitPending = async () => {
    if (batch && pendingWrites > 0) await batch.commit();
    batch = null;
    pendingWrites = 0;
  };

  for (const group of groups) {
    if (pendingWrites > 0 && pendingWrites + group.updates.length > SWEEP_BATCH_SIZE) {
      await commitPending();
    }
    if (!batch) batch = writeBatch(db);
    group.updates.forEach(({ id, fields }) => {
      (batch as ReturnType<typeof writeBatch>).update(doc(db, "todos", id), fields);
    });
    pendingWrites += group.updates.length;
    totalWritten += group.updates.length;
  }

  await commitPending();
  return totalWritten;
};

/**
 * 이미 읽어둔 전체 스냅샷에서 다음 루트 order를 계산한다. getNextRootOrder의 Firestore
 * 쿼리(`userId` + `parentId == null`)는 이 스냅샷을 `parentId === null`로 거른 것과 정확히
 * 같은 집합이다 — allTodos가 `userId`만으로 필터링된 무조건 전체 읽기이기 때문이다.
 * 따라서 확장 스윕에서는 두 번째 읽기가 순수한 낭비였다.
 *
 * 원자성은 잃지 않는다: 스냅샷은 withRecurringSeriesLock 안에서 떴고, getNextRootOrder
 * 자체도 트랜잭션이 아닌 read-then-write였다.
 *
 * `?? 0`과 시드 `-1`은 getNextRootOrder의 semantics를 그대로 옮긴 것이다. order 필드가
 * 없는 레거시 문서는 0으로 취급하고, 루트가 하나도 없으면 -1 + 1 = 0이 된다.
 * (정렬용 normalizeOrder는 없는 order를 Infinity로 보내므로 여기 쓰면 안 된다.)
 */
const nextRootOrderFrom = (allTodos: Todo[]): number =>
  allTodos
    .filter((t) => t.parentId === null)
    .reduce((max, t) => Math.max(max, t.order ?? 0), -1) + 1;

/** commitUpdates와 동일하게 실제로 커밋된 문서 수만 센다. */
const commitCreates = async (
  db: Firestore,
  creates: TodoCreate[],
): Promise<number> => {
  let committed = 0;
  for (let i = 0; i < creates.length; i += SWEEP_BATCH_SIZE) {
    const chunk = creates.slice(i, i + SWEEP_BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ id, doc: docData }) => {
      batch.set(doc(db, "todos", id), docData);
    });
    await batch.commit();
    committed += chunk.length;
  }
  return committed;
};

/**
 * 개별 스윕을 격리 실행한다. 하나가 실패해도 나머지는 진행해야 한다. 사용자 액션이 아닌
 * 백그라운드 유지보수라 조용히 넘어가되(다음 접속 때 재시도), 실패는 failedSweeps와
 * onSweepError로 호출부에 알린다.
 */
const runSweep = async (
  name: SweepName,
  run: () => Promise<number>,
  failedSweeps: SweepName[],
  onSweepError?: (error: unknown, sweep: SweepName) => void,
): Promise<number> => {
  try {
    return await run();
  } catch (error) {
    failedSweeps.push(name);
    onSweepError?.(error, name);
    return 0;
  }
};

/**
 * 앱 진입 시 1회 실행되는 백그라운드 유지보수. 세 정책을 한 번의 읽기로 처리한다.
 *
 * 1. 30일 지난 완료 프로젝트를 archived 처리 (루트+자식 단위)
 * 2. 지난 미완료 반복 인스턴스를 overdueArchived 처리
 * 3. 무기한 반복 시리즈를 새 호라이즌까지 확장
 *
 * written은 실제로 쓴 문서 수다. 호출부는 이 값이 0보다 클 때만 캐시를 무효화한다.
 * 전체를 withRecurringSeriesLock으로 감싼다. 확장(3)은 읽고 판단한 뒤 쓰는 사이에 사용자의
 * editRecurringSeries가 끼어들면 stale 스냅샷 기준으로 커밋되기 때문이다.
 * 전체 읽기가 실패하면 reject한다.
 */
export const runStartupMaintenance = (
  db: Firestore,
  userId: string,
  options: StartupMaintenanceOptions = {},
): Promise<StartupMaintenanceResult> =>
  withRecurringSeriesLock(async () => {
    const { cutoffDays = 30, horizonEnd = getDefaultHorizonEnd(), onSweepError } = options;
    const allTodos = await fetchAllUserTodos(db, userId);

    const now = new Date().toISOString();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cutoffDays);
    const cutoffISO = cutoff.toISOString();
    // planOverdueRecurringSweep이 dueAt을 로컬 setHours로 자정 절삭해 비교하므로,
    // 기준도 반드시 로컬 자정이어야 한다(UTC 자정을 섞으면 KST에서 하루가 밀린다).
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const failedSweeps: SweepName[] = [];
    let written = 0;

    written += await runSweep(
      "archived",
      () => commitArchiveGroups(db, planArchivedSweep(allTodos, cutoffISO, now)),
      failedSweeps,
      onSweepError,
    );

    written += await runSweep(
      "overdue",
      () => commitUpdates(db, planOverdueRecurringSweep(allTodos, todayStart, now)),
      failedSweeps,
      onSweepError,
    );

    written += await runSweep(
      "extension",
      async () => {
        const extensions = planIndefiniteExtension(allTodos, horizonEnd);
        // 생성할 것이 있을 때만 order를 계산한다 — 대부분의 앱 진입에서는 여기서 끝난다.
        if (extensions.length === 0) return 0;
        const startOrder = nextRootOrderFrom(allTodos);
        return commitCreates(db, buildExtensionCreates(extensions, startOrder, userId, now));
      },
      failedSweeps,
      onSweepError,
    );

    return { written, failedSweeps };
  });
