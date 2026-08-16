import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Sentry from "@sentry/react";
import type { Todo } from "../../types/todo.type";

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-10T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "test-user-id" } },
  googleProvider: {},
}));

vi.mock("@/shared/lib/firestore", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn((_db, _col, id) => ({ id })),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  getDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "todo-1",
  userId: "test-user-id",
  title: "테스트 할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  recurrence: null,
  recurrenceId: null,
  archived: false,
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  ...overrides,
});

const toDocSnapshot = (todos: Todo[]) =>
  ({
    docs: todos.map((t) => ({
      id: t.id,
      ref: { id: t.id },
      data: () => {
        const { id: _id, ...rest } = t;
        return rest;
      },
    })),
  }) as never;

const makeBatch = () => ({
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
});

/**
 * 커밋 경계를 기록하는 배치. commit()이 불릴 때마다 그 직전까지 스테이징된 문서 ID
 * 묶음을 `commits`에 밀어 넣어, "어떤 문서들이 같은 커밋에 들어갔는지"를 검사할 수 있게
 * 한다. 그룹 무결성(루트와 자식이 절대 다른 커밋으로 갈라지지 않음) 검증에 필요하다.
 */
const makeRecordingBatch = () => {
  const commits: string[][] = [];
  let pending: string[] = [];
  const stage = (ref: unknown) => {
    pending.push((ref as { id: string }).id);
  };
  return {
    commits,
    set: vi.fn(stage),
    update: vi.fn(stage),
    delete: vi.fn(),
    commit: vi.fn(async () => {
      commits.push(pending);
      pending = [];
    }),
  };
};

describe("runStartupMaintenance", () => {
  // runSweep이 스윕별 예외를 삼키므로(의도된 격리 동작), 예외가 나도 written만 줄어들 뿐
  // "쓰지 않았다" 류의 단언은 그대로 통과해 테스트가 공허해진다. 실패를 기대하는 테스트를
  // 빼고는 전부 console.error가 불리지 않았음을 단언해, 삼켜진 예외를 회귀로 잡는다.
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockReset();
    vi.mocked(writeBatch).mockReset();
    const firebase = await import("@/shared/lib/firebase");
    Object.assign(firebase.auth, { currentUser: { uid: "test-user-id" } });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(Sentry.captureException).mockClear();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("쓸 것이 없으면 0을 반환하고 배치를 만들지 않는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([makeTodo()]));

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(written).toBe(0);
    expect(vi.mocked(writeBatch)).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("컬렉션을 한 번만 읽는다", async () => {
    const { getDocs } = await import("firebase/firestore");
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([makeTodo()]));

    const { runStartupMaintenance } = await import("../todoApi");
    await runStartupMaintenance();

    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("루트와 자식을 자식 조회 없이 함께 archived 처리한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const root = makeTodo({ id: "root-1", status: "done", doneAt: "2026-06-01T00:00:00.000Z" });
    const child = makeTodo({ id: "child-1", parentId: "root-1", status: "done" });
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([root, child]));
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(1);
    expect(written).toBe(2);
    expect(batch.update).toHaveBeenCalledWith(
      { id: "root-1" },
      expect.objectContaining({ archived: true }),
    );
    expect(batch.update).toHaveBeenCalledWith(
      { id: "child-1" },
      expect.objectContaining({ archived: true }),
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("지난 미완료 반복 인스턴스에 overdueArchived를 세운다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const overdue = makeTodo({
      id: "inst-1",
      recurrenceId: "series-1",
      recurrence: { type: "daily", endType: "untilDate", endDate: "2026-07-05T00:00:00.000Z" },
      dueAt: "2026-07-01T00:00:00.000Z",
    });
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([overdue]));
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(written).toBe(1);
    expect(batch.update).toHaveBeenCalledWith(
      { id: "inst-1" },
      expect.objectContaining({ overdueArchived: true }),
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("한 스윕이 실패해도 나머지 스윕은 계속 진행한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const root = makeTodo({ id: "root-1", status: "done", doneAt: "2026-06-01T00:00:00.000Z" });
    const overdue = makeTodo({
      id: "inst-1",
      recurrenceId: "series-1",
      recurrence: { type: "daily", endType: "untilDate", endDate: "2026-07-05T00:00:00.000Z" },
      dueAt: "2026-07-01T00:00:00.000Z",
    });
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([root, overdue]));

    const failingBatch = makeBatch();
    failingBatch.commit.mockRejectedValue(new Error("permission-denied"));
    const okBatch = makeBatch();
    vi.mocked(writeBatch)
      .mockReturnValueOnce(failingBatch as never) // archived 스윕 → 실패
      .mockReturnValue(okBatch as never); // overdue 스윕 → 성공

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(okBatch.update).toHaveBeenCalledWith(
      { id: "inst-1" },
      expect.objectContaining({ overdueArchived: true }),
    );
    expect(written).toBe(1); // 실패한 스윕은 0으로 집계
    // 이 테스트만이 console.error를 기대한다(나머지는 전부 not.toHaveBeenCalled).
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("스윕이 실패하면 콘솔뿐 아니라 Sentry로도 보고한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const root = makeTodo({ id: "root-1", status: "done", doneAt: "2026-06-01T00:00:00.000Z" });
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([root]));

    const failingBatch = makeBatch();
    const sweepError = new Error("permission-denied");
    failingBatch.commit.mockRejectedValue(sweepError);
    vi.mocked(writeBatch).mockReturnValue(failingBatch as never);

    const { runStartupMaintenance } = await import("../todoApi");
    await runStartupMaintenance();

    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(
      sweepError,
      { tags: { sweep: "archived" } },
    );
  });

  it("한 배치 상한을 넘는 overdue 대상은 나눠서 커밋한다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const many = Array.from({ length: 401 }, (_, i) =>
      makeTodo({
        id: `inst-${i}`,
        recurrenceId: "series-1",
        recurrence: { type: "daily", endType: "untilDate", endDate: "2026-07-05T00:00:00.000Z" },
        dueAt: "2026-07-01T00:00:00.000Z",
      }),
    );
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot(many));
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(written).toBe(401);
    expect(batch.commit).toHaveBeenCalledTimes(2); // 400 + 1
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  /**
   * 확장 스윕이 **실제로 쓰는** 경로에서도 읽기가 1회뿐임을 고정한다.
   *
   * 위의 `"컬렉션을 한 번만 읽는다"`는 쓸 것이 없는 경로만 덮는다 — 그 경로는
   * `extensions.length === 0` early return에 걸려 애초에 두 번째 읽기 지점에 닿지 않는다.
   * order를 공유 스냅샷에서 메모리로 계산하게 만든 이번 변경이 만들어낸 속성은 여기서만
   * 관측되므로, 별도 테스트로 못박는다.
   */
  it("확장을 실제로 쓸 때도 컬렉션을 한 번만 읽는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const latest = makeTodo({
      id: "latest-1",
      order: 7,
      dueAt: "2026-07-12T09:00:00",
      startAt: "2026-07-12T09:00:00",
      recurrenceId: "series-1",
      recurrence: { type: "daily", endType: "indefinite" },
    });
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([latest]));
    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance(30, new Date("2026-07-15T00:00:00"));

    // 확장이 실제로 일어났는지 먼저 확인한다 — 0건이면 읽기 단언이 공허해진다.
    expect(written).toBeGreaterThan(0);
    expect(batch.set).toHaveBeenCalled();

    // getNextRootOrder용 두 번째 읽기가 없어야 한다.
    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(1);

    // order는 공유 스냅샷의 루트 최대값(7) 다음부터 이어져야 한다.
    const orders = batch.set.mock.calls.map((call) => (call[1] as { order: number }).order);
    expect(orders[0]).toBe(8);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  /**
   * commitArchiveGroups가 존재하는 유일한 이유를 고정한다: 배치가 쪼개지더라도 한 루트와
   * 그 자식들은 반드시 같은 커밋에 들어가야 한다. 갈라지면 한 프로젝트의 자식 일부만
   * archived된 상태가 남아 getProjectProgress의 진행률이 틀어진다.
   *
   * 그룹 크기를 3(루트 1 + 자식 2)으로 잡은 것이 핵심이다 — 3은 400을 나누어떨어지게 하지
   * 않으므로, 그룹을 무시하고 평평하게 400개씩 자르면 134번째 그룹이 두 커밋에 걸쳐 반드시
   * 쪼개진다. 그룹 크기가 4였다면 400 = 4 x 100이라 평평한 청킹도 우연히 그룹 경계와
   * 맞아떨어져 이 테스트가 회귀를 못 잡는다.
   */
  it("배치가 쪼개져도 루트와 그 자식은 같은 커밋에 함께 들어간다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");

    const GROUP_COUNT = 150; // 150 x 3 = 450 write > SWEEP_BATCH_SIZE(400) → 반드시 분할
    const todos: Todo[] = [];
    for (let g = 0; g < GROUP_COUNT; g += 1) {
      todos.push(
        makeTodo({ id: `root-${g}`, status: "done", doneAt: "2026-06-01T00:00:00.000Z" }),
      );
      todos.push(makeTodo({ id: `child-${g}-a`, parentId: `root-${g}`, status: "done" }));
      todos.push(makeTodo({ id: `child-${g}-b`, parentId: `root-${g}`, status: "done" }));
    }
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot(todos));

    const batch = makeRecordingBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(written).toBe(GROUP_COUNT * 3);

    // 분할이 실제로 일어났는지 먼저 확인한다. 커밋이 1번뿐이면 아래 무결성 단언이
    // 공허하게 통과하므로 이 단언이 테스트의 전제를 지킨다.
    expect(batch.commits.length).toBeGreaterThan(1);

    // 어떤 커밋도 SWEEP_BATCH_SIZE를 넘지 않아야 한다.
    batch.commits.forEach((ids) => {
      expect(ids.length).toBeLessThanOrEqual(400);
    });

    // 각 그룹(루트 + 자식 2)의 세 문서가 전부 "같은 하나의" 커밋에 들어가야 한다.
    const commitIndexById = new Map<string, number>();
    batch.commits.forEach((ids, index) => {
      ids.forEach((id) => commitIndexById.set(id, index));
    });

    for (let g = 0; g < GROUP_COUNT; g += 1) {
      const memberCommits = [`root-${g}`, `child-${g}-a`, `child-${g}-b`].map((id) => {
        expect(commitIndexById.has(id)).toBe(true);
        return commitIndexById.get(id);
      });
      expect(new Set(memberCommits).size).toBe(1);
    }

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  /**
   * todayStart를 로컬 자정으로 만드는 것을 배선 레벨에서 고정한다.
   *
   * planOverdueRecurringSweep은 dueAt을 로컬 setHours로 절삭해 비교하므로 기준도 로컬이어야
   * 한다. 순수 함수 테스트(startupMaintenance.test.ts)는 todayStart를 인자로 받으므로 이
   * 결합을 검증할 수 없다 — 기준을 만드는 곳은 배선(runStartupMaintenanceImpl)뿐이다.
   *
   * 픽스처는 "로컬 기준 오늘"과 "로컬 기준 어제"를 하나씩 둔다. setUTCHours로 바꾸면
   * 시스템 시각(2026-07-10T00:00Z)의 UTC 자정이 로컬 자정보다 뒤로 밀려, 아직 지나지 않은
   * "오늘" 인스턴스까지 overdue로 잡혀 written이 2가 된다.
   *
   * 이 테스트는 TZ=UTC에서는 두 기준이 일치해 회귀를 잡지 못한다. setup.ts가 TZ를 비-UTC로
   * 고정하고(Asia/Seoul) CI가 America/New_York으로 한 번 더 도는 이유가 이것이다.
   */
  it("overdue 판정 기준을 UTC 자정이 아닌 로컬 자정으로 잡는다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");

    // 2026-07-10T02:00Z = 서울 7/10 11:00 / 뉴욕 7/9 22:00 — 두 타임존 모두 "로컬 오늘"이라
    // overdue가 아니다. UTC 자정 기준으로 바꾸면 overdue로 잘못 잡힌다.
    const todayLocal = makeTodo({
      id: "inst-today",
      recurrenceId: "series-1",
      recurrence: { type: "daily", endType: "untilDate", endDate: "2026-07-20T00:00:00.000Z" },
      dueAt: "2026-07-10T02:00:00.000Z",
    });
    // 2026-07-09T02:00Z = 서울 7/9 11:00 / 뉴욕 7/8 22:00 — 두 타임존 모두 "로컬 어제".
    const yesterdayLocal = makeTodo({
      id: "inst-yesterday",
      recurrenceId: "series-1",
      recurrence: { type: "daily", endType: "untilDate", endDate: "2026-07-20T00:00:00.000Z" },
      dueAt: "2026-07-09T02:00:00.000Z",
    });
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([todayLocal, yesterdayLocal]));

    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(written).toBe(1);
    expect(batch.update).toHaveBeenCalledWith(
      { id: "inst-yesterday" },
      expect.objectContaining({ overdueArchived: true }),
    );
    expect(batch.update).not.toHaveBeenCalledWith(
      { id: "inst-today" },
      expect.anything(),
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  /**
   * cutoffDays가 실제로 "며칠 전"을 뜻하는지 고정한다. 부호를 뒤집으면(getDate() + cutoffDays)
   * 컷오프가 미래가 되어 완료된 모든 프로젝트가 즉시 archived된다 — 데이터가 화면에서
   * 사라지는 사고인데, 컷오프를 한참 넘긴 픽스처 하나만으로는 잡히지 않는다. 경계를
   * 양쪽에서 감싸는 픽스처가 필요하다.
   *
   * 시스템 시각 2026-07-10T00:00Z 기준 30일 컷오프는 서울/뉴욕 모두 2026-06-10T00:00Z다.
   */
  it("기본 컷오프는 30일이고 그 경계를 양쪽으로 가른다", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");

    const justOverCutoff = makeTodo({
      id: "root-old",
      status: "done",
      doneAt: "2026-06-09T00:00:00.000Z", // 컷오프보다 하루 이전 → archived
    });
    const justUnderCutoff = makeTodo({
      id: "root-recent",
      status: "done",
      doneAt: "2026-06-11T00:00:00.000Z", // 컷오프보다 하루 이후 → 보존
    });
    vi.mocked(getDocs).mockResolvedValue(toDocSnapshot([justOverCutoff, justUnderCutoff]));

    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance();

    expect(written).toBe(1);
    expect(batch.update).toHaveBeenCalledWith(
      { id: "root-old" },
      expect.objectContaining({ archived: true }),
    );
    expect(batch.update).not.toHaveBeenCalledWith({ id: "root-recent" }, expect.anything());
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("cutoffDays 인자를 실제로 반영한다 (90일)", async () => {
    const { getDocs, writeBatch } = await import("firebase/firestore");

    // 90일 컷오프는 2026-04-11T00:00Z(서울/뉴욕 동일).
    const overNinetyDays = makeTodo({
      id: "root-ancient",
      status: "done",
      doneAt: "2026-04-10T00:00:00.000Z", // 90일 컷오프보다 이전 → archived
    });
    const underNinetyDays = makeTodo({
      id: "root-mid",
      status: "done",
      doneAt: "2026-04-12T00:00:00.000Z", // 90일 컷오프 직후 → 보존
    });
    // 기본값 30일이었다면 archived됐을 항목. 90을 넘겼으므로 보존되어야 한다 —
    // 인자가 무시되고 30이 쓰이면 이 단언이 깨진다.
    const wouldArchiveAtThirtyDays = makeTodo({
      id: "root-31d",
      status: "done",
      doneAt: "2026-06-09T00:00:00.000Z",
    });
    vi.mocked(getDocs).mockResolvedValue(
      toDocSnapshot([overNinetyDays, underNinetyDays, wouldArchiveAtThirtyDays]),
    );

    const batch = makeBatch();
    vi.mocked(writeBatch).mockReturnValue(batch as never);

    const { runStartupMaintenance } = await import("../todoApi");
    const written = await runStartupMaintenance(90);

    expect(written).toBe(1);
    expect(batch.update).toHaveBeenCalledWith(
      { id: "root-ancient" },
      expect.objectContaining({ archived: true }),
    );
    expect(batch.update).not.toHaveBeenCalledWith({ id: "root-mid" }, expect.anything());
    expect(batch.update).not.toHaveBeenCalledWith({ id: "root-31d" }, expect.anything());
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
