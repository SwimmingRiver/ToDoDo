import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Todo } from "../../types/todo.type";

vi.mock("@/shared/lib/firebase", () => ({
  db: {},
  auth: {
    currentUser: { uid: "test-user-id" },
  },
  googleProvider: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(() => ({})),
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

const toDocSnapshot = (todos: Todo[]) => ({
  docs: todos.map((t) => ({
    id: t.id,
    ref: { id: t.id },
    data: () => {
      const { id: _id, ...rest } = t;
      return rest;
    },
  })),
});

const emptyDocsSnapshot: {
  docs: { id: string; ref: { id: string }; data: () => Record<string, unknown> }[];
} = { docs: [] };

const makeBatch = () => ({
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
});

const resetFirestoreMocks = async () => {
  const { getDocs, writeBatch } = await import("firebase/firestore");
  vi.mocked(getDocs).mockReset();
  vi.mocked(writeBatch).mockReset();
};

const dailyRule = { type: "daily" as const, endType: "indefinite" as const };

describe("sweepOverdueRecurringTodos", () => {
  beforeEach(async () => {
    await resetFirestoreMocks();
    const firebase = await import("@/shared/lib/firebase");
    Object.assign(firebase.auth, { currentUser: { uid: "test-user-id" } });
  });

  describe("기본 동작 (기본 TZ, setup.ts가 강제하는 Asia/Seoul 기준)", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-07-10T09:00:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("아직 overdueArchived 안 된 여러 지난 미완료 인스턴스를 한 번에 overdueArchived: true로 처리한다", async () => {
      const { getDocs, writeBatch } = await import("firebase/firestore");
      const overdue1 = makeTodo({
        id: "series-1_2026-07-01",
        status: "todo",
        dueAt: "2026-07-01T09:00:00.000Z",
        recurrenceId: "series-1",
        recurrence: dailyRule,
      });
      const overdue2 = makeTodo({
        id: "series-1_2026-07-05",
        status: "todo",
        dueAt: "2026-07-05T09:00:00.000Z",
        recurrenceId: "series-1",
        recurrence: dailyRule,
      });
      vi.mocked(getDocs).mockResolvedValueOnce(
        toDocSnapshot([overdue1, overdue2]) as ReturnType<typeof getDocs> extends Promise<
          infer T
        >
          ? T
          : never,
      );
      const batch = makeBatch();
      vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

      const { sweepOverdueRecurringTodos } = await import("../todoApi");
      await sweepOverdueRecurringTodos();

      expect(batch.update).toHaveBeenCalledWith(
        { id: "series-1_2026-07-01" },
        expect.objectContaining({ overdueArchived: true }),
      );
      expect(batch.update).toHaveBeenCalledWith(
        { id: "series-1_2026-07-05" },
        expect.objectContaining({ overdueArchived: true }),
      );
      expect(batch.update).toHaveBeenCalledTimes(2);
      expect(batch.commit).toHaveBeenCalledTimes(1);
    });

    it("이미 overdueArchived: true인 문서는 재처리 대상에서 제외한다", async () => {
      const { getDocs, writeBatch } = await import("firebase/firestore");
      const alreadyArchived = makeTodo({
        id: "series-1_2026-07-01",
        status: "todo",
        dueAt: "2026-07-01T09:00:00.000Z",
        recurrenceId: "series-1",
        recurrence: dailyRule,
        overdueArchived: true,
      });
      const notYetArchived = makeTodo({
        id: "series-1_2026-07-05",
        status: "todo",
        dueAt: "2026-07-05T09:00:00.000Z",
        recurrenceId: "series-1",
        recurrence: dailyRule,
      });
      vi.mocked(getDocs).mockResolvedValueOnce(
        toDocSnapshot([alreadyArchived, notYetArchived]) as ReturnType<
          typeof getDocs
        > extends Promise<infer T>
          ? T
          : never,
      );
      const batch = makeBatch();
      vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

      const { sweepOverdueRecurringTodos } = await import("../todoApi");
      await sweepOverdueRecurringTodos();

      // 이미 archived된 문서는 batch.update 호출 대상에 아예 포함되지 않아야 한다.
      expect(batch.update).toHaveBeenCalledTimes(1);
      expect(batch.update).toHaveBeenCalledWith(
        { id: "series-1_2026-07-05" },
        expect.objectContaining({ overdueArchived: true }),
      );
    });

    it("dueAt이 아직 지나지 않은 미래 인스턴스는 대상에서 제외하고, 대상이 하나도 없으면 batch를 만들지 않는다", async () => {
      const { getDocs, writeBatch } = await import("firebase/firestore");
      const futureInstance = makeTodo({
        id: "series-1_2026-08-01",
        status: "todo",
        dueAt: "2026-08-01T09:00:00.000Z",
        recurrenceId: "series-1",
        recurrence: dailyRule,
      });
      vi.mocked(getDocs).mockResolvedValueOnce(
        toDocSnapshot([futureInstance]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      );

      const { sweepOverdueRecurringTodos } = await import("../todoApi");
      await sweepOverdueRecurringTodos();

      expect(writeBatch).not.toHaveBeenCalled();
    });

    it("recurrenceId가 없는(반복 아닌) todo는 dueAt이 지났어도 대상에서 제외한다", async () => {
      const { getDocs, writeBatch } = await import("firebase/firestore");
      const plainOverdue = makeTodo({
        id: "plain-1",
        status: "todo",
        dueAt: "2026-07-01T09:00:00.000Z",
        recurrenceId: null,
        recurrence: null,
      });
      vi.mocked(getDocs).mockResolvedValueOnce(
        toDocSnapshot([plainOverdue]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      );

      const { sweepOverdueRecurringTodos } = await import("../todoApi");
      await sweepOverdueRecurringTodos();

      expect(writeBatch).not.toHaveBeenCalled();
    });

    it("userId + status == todo 로만 쿼리해서 done/doing 상태 문서는 애초에 조회 대상에 포함하지 않는다", async () => {
      const { getDocs, where, writeBatch } = await import("firebase/firestore");
      vi.mocked(getDocs).mockResolvedValueOnce(
        emptyDocsSnapshot as ReturnType<typeof getDocs> extends Promise<infer T> ? T : never,
      );

      const { sweepOverdueRecurringTodos } = await import("../todoApi");
      await sweepOverdueRecurringTodos();

      expect(where).toHaveBeenCalledWith("userId", "==", "test-user-id");
      expect(where).toHaveBeenCalledWith("status", "==", "todo");
      expect(writeBatch).not.toHaveBeenCalled();
    });

    it("대상 수가 SWEEP_BATCH_SIZE(400)를 넘으면 여러 batch로 나눠 commit한다", async () => {
      const { getDocs, writeBatch } = await import("firebase/firestore");
      const TARGET_COUNT = 450;
      const targets = Array.from({ length: TARGET_COUNT }, (_, i) =>
        makeTodo({
          id: `series-1_2026-06-${String((i % 28) + 1).padStart(2, "0")}-${i}`,
          status: "todo",
          dueAt: "2026-07-01T09:00:00.000Z",
          recurrenceId: "series-1",
          recurrence: dailyRule,
        }),
      );
      vi.mocked(getDocs).mockResolvedValueOnce(
        toDocSnapshot(targets) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      );
      const batches: ReturnType<typeof makeBatch>[] = [];
      vi.mocked(writeBatch).mockImplementation(() => {
        const b = makeBatch();
        batches.push(b);
        return b as unknown as ReturnType<typeof writeBatch>;
      });

      const { sweepOverdueRecurringTodos } = await import("../todoApi");
      await sweepOverdueRecurringTodos();

      expect(batches.length).toBe(2);
      batches.forEach((b) => expect(b.commit).toHaveBeenCalledTimes(1));
      const totalUpdateCalls = batches.reduce((sum, b) => sum + b.update.mock.calls.length, 0);
      expect(totalUpdateCalls).toBe(TARGET_COUNT);
    });

    it("인증되지 않은 경우 에러를 던져야 한다", async () => {
      const firebase = await import("@/shared/lib/firebase");
      Object.defineProperty(firebase.auth, "currentUser", { value: null, configurable: true });

      const { sweepOverdueRecurringTodos } = await import("../todoApi");
      await expect(sweepOverdueRecurringTodos()).rejects.toThrow("Not authenticated");

      Object.defineProperty(firebase.auth, "currentUser", {
        value: { uid: "test-user-id" },
        configurable: true,
      });
    });
  });

  // dueAt은 UTC ISO 문자열로 저장된다("로컬 날짜 추출 시 split('T')[0] 금지" 회귀 이력 —
  // project_dueat_utc_storage 메모). "오늘 지났는가" 판정은 UTC 캘린더 날짜가 아니라
  // 로컬(TZ) 캘린더 날짜를 기준으로 해야 한다. TZ를 명시적으로 비-UTC로 고정해 실제
  // 로컬 자정 비교 로직이 맞는지 검증한다. (과거 CI가 UTC로 돌아 타임존 버그가 테스트를
  // 통과한 채로 숨어있었던 이력이 있다 — feedback_timezone_test_ci_utc 메모)
  describe("타임존 경계 (UTC 저장값 vs 로컬 자정 판정)", () => {
    let originalTz: string | undefined;

    beforeEach(() => {
      originalTz = process.env.TZ;
    });

    afterEach(() => {
      process.env.TZ = originalTz;
      vi.useRealTimers();
    });

    it("Asia/Seoul(UTC+9)에서 UTC로는 '어제'지만 로컬로는 '오늘'인 dueAt은 overdue로 처리하지 않는다", async () => {
      process.env.TZ = "Asia/Seoul";
      vi.useFakeTimers({ toFake: ["Date"] });
      // 로컬(Seoul) 기준 오늘 = 2026-07-10 09:00 (UTC로는 2026-07-10T00:00:00.000Z)
      vi.setSystemTime(new Date("2026-07-10T09:00:00"));

      const { getDocs, writeBatch } = await import("firebase/firestore");
      // UTC 2026-07-09T16:00:00.000Z == Seoul 로컬 2026-07-10T01:00:00 (오늘, 아직 지나지 않음).
      // split("T")[0]로 순진하게 날짜를 뽑으면 "2026-07-09"(어제)로 오판해 잘못 overdue 처리된다.
      const dueToday = makeTodo({
        id: "series-1_boundary",
        status: "todo",
        dueAt: "2026-07-09T16:00:00.000Z",
        recurrenceId: "series-1",
        recurrence: dailyRule,
      });
      vi.mocked(getDocs).mockResolvedValueOnce(
        toDocSnapshot([dueToday]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      );

      const { sweepOverdueRecurringTodos } = await import("../todoApi");
      await sweepOverdueRecurringTodos();

      expect(writeBatch).not.toHaveBeenCalled();
    });

    it("Asia/Seoul(UTC+9)에서 로컬 기준으로도 명확히 어제인 dueAt은 overdue로 처리한다", async () => {
      process.env.TZ = "Asia/Seoul";
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-07-10T09:00:00"));

      const { getDocs, writeBatch } = await import("firebase/firestore");
      // UTC 2026-07-08T16:00:00.000Z == Seoul 로컬 2026-07-09T01:00:00 (어제) → overdue.
      const overdueYesterday = makeTodo({
        id: "series-1_yesterday",
        status: "todo",
        dueAt: "2026-07-08T16:00:00.000Z",
        recurrenceId: "series-1",
        recurrence: dailyRule,
      });
      vi.mocked(getDocs).mockResolvedValueOnce(
        toDocSnapshot([overdueYesterday]) as ReturnType<typeof getDocs> extends Promise<
          infer T
        >
          ? T
          : never,
      );
      const batch = makeBatch();
      vi.mocked(writeBatch).mockReturnValue(batch as unknown as ReturnType<typeof writeBatch>);

      const { sweepOverdueRecurringTodos } = await import("../todoApi");
      await sweepOverdueRecurringTodos();

      expect(batch.update).toHaveBeenCalledWith(
        { id: "series-1_yesterday" },
        expect.objectContaining({ overdueArchived: true }),
      );
    });

    it("America/New_York(음수 오프셋)에서 UTC로는 '오늘'이지만 로컬로는 아직 '내일'이 아닌 dueAt은 overdue로 처리하지 않는다", async () => {
      process.env.TZ = "America/New_York";
      vi.useFakeTimers({ toFake: ["Date"] });
      // 로컬(New_York, EDT=UTC-4) 기준 오늘 = 2026-07-10 09:00 (UTC로는 2026-07-10T13:00:00.000Z)
      vi.setSystemTime(new Date("2026-07-10T09:00:00"));

      const { getDocs, writeBatch } = await import("firebase/firestore");
      // UTC 2026-07-11T02:00:00.000Z == New_York 로컬 2026-07-10T22:00:00 (오늘, 아직 지나지 않음).
      const dueToday = makeTodo({
        id: "series-1_ny-boundary",
        status: "todo",
        dueAt: "2026-07-11T02:00:00.000Z",
        recurrenceId: "series-1",
        recurrence: dailyRule,
      });
      vi.mocked(getDocs).mockResolvedValueOnce(
        toDocSnapshot([dueToday]) as ReturnType<typeof getDocs> extends Promise<infer T>
          ? T
          : never,
      );

      const { sweepOverdueRecurringTodos } = await import("../todoApi");
      await sweepOverdueRecurringTodos();

      expect(writeBatch).not.toHaveBeenCalled();
    });
  });
});
