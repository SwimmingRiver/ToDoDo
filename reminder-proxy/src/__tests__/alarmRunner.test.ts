import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAlarm, ALARM_RETRY_MS, REFRESH_RETRY_MS, type AlarmDeps } from "../alarmRunner";
import { TransientFcmError, type PushMessage, type SendResult } from "../fcm";
import { WINDOW_MS, type ReminderTodo } from "../schedule";
import { HISTORY_RETENTION_MS } from "../history";
import { MemoryReminderStore } from "./memoryStore";

const NOW = Date.parse("2026-10-01T00:00:00.000Z");
const MIN = 60_000;
const iso = (ms: number) => new Date(NOW + ms).toISOString();

const todo = (overrides: Partial<ReminderTodo> = {}): ReminderTodo => ({
  id: "t1",
  userId: "u1",
  title: "보고서",
  status: "todo",
  archived: false,
  dueAt: iso(60 * MIN),
  reminderOffsetMinutes: undefined,
  ...overrides,
});

let store: MemoryReminderStore;
let now: number;
let db: Map<string, ReminderTodo>;
let userDefault: unknown;
let sendPush: ReturnType<typeof vi.fn<(m: PushMessage) => Promise<SendResult>>>;
let firestore: AlarmDeps["firestore"];

const deps = (): AlarmDeps => ({
  store,
  now: () => now,
  uid: "u1",
  firestore,
  sendPush,
  appUrl: "https://app.example.com",
});

beforeEach(() => {
  store = new MemoryReminderStore();
  now = NOW;
  db = new Map([["t1", todo()]]);
  userDefault = undefined;
  sendPush = vi.fn(async () => "sent" as const);
  firestore = {
    queryUpcomingTodos: vi.fn(async () => [...db.values()]),
    getTodo: vi.fn(async (_uid: string, id: string) => db.get(id) ?? null),
    getReminderDefault: vi.fn(async () => userDefault),
  };
  store.upsertToken("tok-a", "web", NOW);
  store.setMeta("refreshPending", "1");
});

describe("runAlarm", () => {
  it("토큰이 없으면 Firestore를 읽지 않고 알람도 걸지 않는다", async () => {
    store.deleteToken("tok-a");
    expect(await runAlarm(deps())).toBeNull();
    expect(firestore.queryUpcomingTodos).not.toHaveBeenCalled();
    expect(firestore.getTodo).not.toHaveBeenCalled();
  });

  it("refreshPending이면 재계산하고 다음 알람은 가장 이른 fireAt", async () => {
    const next = await runAlarm(deps());
    expect(firestore.queryUpcomingTodos).toHaveBeenCalledWith("u1", iso(0), iso(8 * 24 * 60 * MIN));
    expect(next).toBe(NOW + 30 * MIN);
    expect(store.getMeta("refreshPending")).toBe("0");
    expect(store.getMeta("windowEnd")).toBe(String(NOW + WINDOW_MS));
  });

  it("예약이 없으면 windowEnd에 알람을 건다(창이 끝나면 다시 계산)", async () => {
    db.clear();
    expect(await runAlarm(deps())).toBe(NOW + WINDOW_MS);
  });

  it("windowEnd가 지나면 pending이 아니어도 재계산한다", async () => {
    store.setMeta("refreshPending", "0");
    store.setMeta("windowEnd", String(NOW - 1));
    await runAlarm(deps());
    expect(firestore.queryUpcomingTodos).toHaveBeenCalledTimes(1);
  });

  // 던지면 런타임 재시도(약 2분)가 소진된 뒤 알람이 영영 안 걸려 이후 알림이 전부 멈춘다.
  it("재계산 조회가 실패하면 pending을 유지하고 던지는 대신 재시도 알람 시각을 돌려준다", async () => {
    vi.mocked(firestore.queryUpcomingTodos).mockRejectedValueOnce(new Error("503"));
    expect(await runAlarm(deps())).toBe(NOW + ALARM_RETRY_MS);
    expect(store.getMeta("refreshPending")).toBe("1");
  });

  it("재계산 조회 중에 도착한 refresh 신호는 유실되지 않고 곧 다시 계산한다", async () => {
    vi.mocked(firestore.queryUpcomingTodos).mockImplementationOnce(async () => {
      // 조회를 기다리는 동안 DO 입력 게이트가 열려 requestRefresh가 끼어든 상황
      store.setMeta("refreshPending", "1");
      return [...db.values()];
    });
    const next = await runAlarm(deps());
    expect(store.getMeta("refreshPending")).toBe("1");
    expect(REFRESH_RETRY_MS).toBe(5_000);
    expect(next).not.toBeNull();
    expect(next!).toBeLessThanOrEqual(NOW + REFRESH_RETRY_MS);
  });

  it("시각이 된 예약을 재조회 후 모든 토큰으로 보내고 sent에 기록한다", async () => {
    store.upsertToken("tok-b", "web", NOW);
    await runAlarm(deps()); // 예약 생성
    now = NOW + 30 * MIN;
    await runAlarm(deps());

    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(sendPush.mock.calls.map(([m]) => m.token).sort()).toEqual(["tok-a", "tok-b"]);
    expect(sendPush.mock.calls[0][0]).toMatchObject({
      title: "보고서",
      body: "30분 후 마감이에요",
      link: "https://app.example.com/todo/t1",
      todoId: "t1",
      // 마감(NOW+60분) + 5분 유예 - 발송 시각(NOW+30분) = 35분
      ttlSeconds: 35 * 60,
    });
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(true);
    expect(store.nextFireAt()).toBeNull();
  });

  // Review Focus 3: 다른 기기에서 옮기거나 완료했는데 이 사용자의 refresh가 안 온 경우.
  it.each([
    ["마감이 바뀌었으면", () => db.set("t1", todo({ dueAt: iso(3 * 60 * MIN) }))],
    ["완료됐으면", () => db.set("t1", todo({ status: "done" }))],
    ["삭제됐으면", () => db.delete("t1")],
  ])("%s 옛 예약으로 보내지 않는다", async (_label, mutate) => {
    await runAlarm(deps());
    mutate();
    now = NOW + 30 * MIN;
    await runAlarm(deps());
    expect(sendPush).not.toHaveBeenCalled();
    expect(store.dueEntries(now)).toEqual([]);
  });

  it("무효 토큰은 지우고 나머지 기기로는 보낸다", async () => {
    store.upsertToken("tok-dead", "web", NOW);
    sendPush.mockImplementation(async (m) => (m.token === "tok-dead" ? "invalidToken" : "sent"));
    await runAlarm(deps());
    now = NOW + 30 * MIN;
    await runAlarm(deps());
    expect(store.listTokens()).toEqual(["tok-a"]);
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(true);
  });

  // Review Focus 4
  it("한 기기라도 성공하면 다른 기기의 일시 실패로 재시도하지 않는다(중복 방지)", async () => {
    store.upsertToken("tok-flaky", "web", NOW);
    sendPush.mockImplementation(async (m) => {
      if (m.token === "tok-flaky") throw new TransientFcmError(503);
      return "sent";
    });
    await runAlarm(deps());
    now = NOW + 30 * MIN;
    await runAlarm(deps()); // throw하지 않아야 한다(재시도 안 함)
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(true);
    expect(store.dueEntries(now)).toEqual([]);
  });

  it("모든 기기가 일시 실패면 sent에 기록하지 않고 예약을 남긴 채 재시도 시각을 돌려준다", async () => {
    sendPush.mockRejectedValue(new TransientFcmError(503));
    await runAlarm(deps());
    now = NOW + 30 * MIN;
    expect(await runAlarm(deps())).toBe(now + ALARM_RETRY_MS);
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(false);
    expect(store.dueEntries(now)).toHaveLength(1);
  });

  // Fix round 1, Important #1: 비일시(TransientFcmError가 아닌) 에러도 부분 발송 후엔
  // 삼켜야 한다. 안 그러면 이미 받은 기기에 재시도 때 중복으로 간다.
  it("한 기기라도 성공하면 다른 기기의 비일시 에러로도 재시도하지 않는다(중복 방지)", async () => {
    store.upsertToken("tok-b", "web", NOW);
    sendPush.mockImplementation(async (m) => {
      if (m.token === "tok-b") throw new Error("403");
      return "sent";
    });
    await runAlarm(deps());
    now = NOW + 30 * MIN;
    await expect(runAlarm(deps())).resolves.not.toThrow();
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(true);

    const callCountAfterSend = sendPush.mock.calls.length;
    await runAlarm(deps()); // 같은 now에 다시 걸어도 이미 지워진 예약이라 더 보내지 않는다.
    expect(sendPush.mock.calls.length).toBe(callCountAfterSend);
  });

  it("모든 기기가 비일시 에러면 sent 기록 없이 예약을 남긴 채 재시도 시각을 돌려준다", async () => {
    sendPush.mockRejectedValue(new Error("403"));
    await runAlarm(deps());
    now = NOW + 30 * MIN;
    expect(await runAlarm(deps())).toBe(now + ALARM_RETRY_MS);
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(false);
    expect(store.dueEntries(now)).toHaveLength(1);
  });

  it("이미 보낸 예약은 다시 보내지 않는다", async () => {
    await runAlarm(deps());
    store.markSent("t1", NOW + 30 * MIN, Date.parse(iso(60 * MIN)));
    now = NOW + 30 * MIN;
    await runAlarm(deps());
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("마감 하루가 지난 sent 기록은 정리한다", async () => {
    store.markSent("old", 1, NOW - 25 * 60 * MIN);
    await runAlarm(deps());
    expect(store.isSent("old", 1)).toBe(false);
  });

  // Fix round 1, Important #2: 재계산을 due 처리보다 먼저 하면 computeSchedule이
  // fireAt <= now인 항목을 걸러내 이미 예약된(아직 안 보낸) 알림이 조용히 사라진다.
  // due 처리를 먼저 해야 이 알림이 살아남는다.
  it("재계산이 밀려 있어도(refreshPending) 이미 예약된 알림을 먼저 보낸다", async () => {
    await runAlarm(deps()); // 예약 생성: fireAt = NOW + 30분
    store.setMeta("refreshPending", "1"); // 다른 기기의 refresh가 도착했다고 가정
    now = NOW + 30 * MIN + 1000; // fireAt을 막 지난 시점
    await runAlarm(deps());
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(true);
  });

  it("마감이 바뀐 할 일은 같은 실행 안에서 새 시각으로 재예약된다", async () => {
    await runAlarm(deps()); // 예약 생성: fireAt = NOW + 30분
    const newDueAt = iso(3 * 60 * MIN);
    db.set("t1", todo({ dueAt: newDueAt }));
    now = NOW + 30 * MIN;
    await runAlarm(deps());
    const rescheduled = store.dueEntries(Number.MAX_SAFE_INTEGER).find((e) => e.todoId === "t1");
    expect(rescheduled?.fireAt).toBe(Date.parse(newDueAt) - 30 * MIN);
  });

  it("유예 시간 안에 늦게 울려도 TTL은 0 이상이다", async () => {
    await runAlarm(deps());
    now = NOW + 64 * MIN; // 마감 4분 지남, 5분 유예 안
    await runAlarm(deps());
    expect(sendPush.mock.calls[0][0].ttlSeconds).toBe(60);
  });

  it("한 예약의 발송이 실패해도 같은 시각의 다른 예약은 보낸다", async () => {
    db.set("t2", todo({ id: "t2", title: "회의" }));
    await runAlarm(deps());
    sendPush.mockImplementation(async (m) => {
      if (m.todoId === "t1") throw new TransientFcmError(503);
      return "sent";
    });
    now = NOW + 30 * MIN;
    expect(await runAlarm(deps())).toBe(now + ALARM_RETRY_MS);
    expect(store.isSent("t2", NOW + 30 * MIN)).toBe(true);
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(false);
  });

  it("발송 직전 재조회가 실패해도 던지지 않고 예약을 남긴 채 재시도한다", async () => {
    await runAlarm(deps());
    vi.mocked(firestore.getTodo).mockRejectedValueOnce(new Error("503"));
    now = NOW + 30 * MIN;
    expect(await runAlarm(deps())).toBe(now + ALARM_RETRY_MS);
    expect(store.dueEntries(now)).toHaveLength(1);

    now += ALARM_RETRY_MS;
    await runAlarm(deps());
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(true);
  });

  it("계속 실패하던 예약은 마감+유예가 지나면 조회 없이 버리고 재시도를 멈춘다", async () => {
    await runAlarm(deps());
    vi.mocked(firestore.getTodo).mockRejectedValue(new Error("503"));
    now = NOW + 30 * MIN;
    await runAlarm(deps());

    now = NOW + 66 * MIN; // 마감(60분) + 유예(5분) 초과
    vi.mocked(firestore.getTodo).mockClear();
    const next = await runAlarm(deps());
    expect(firestore.getTodo).not.toHaveBeenCalled();
    expect(store.dueEntries(now)).toEqual([]);
    expect(next).toBe(NOW + WINDOW_MS);
  });

  it("발송이 실패한 실행에서 재계산이 돌아도 실패한 예약은 사라지지 않는다", async () => {
    await runAlarm(deps());
    sendPush.mockRejectedValueOnce(new TransientFcmError(503));
    store.setMeta("refreshPending", "1"); // 같은 실행에서 재계산이 돌게 한다
    now = NOW + 30 * MIN;
    expect(await runAlarm(deps())).toBe(now + ALARM_RETRY_MS);
    expect(store.dueEntries(now).map((e) => e.todoId)).toEqual(["t1"]);

    now += ALARM_RETRY_MS;
    await runAlarm(deps());
    expect(store.isSent("t1", NOW + 30 * MIN)).toBe(true);
  });

  describe("발송 기록", () => {
    it("발송에 성공하면 발송 시점 제목으로 기록한다", async () => {
      await runAlarm(deps());
      now = NOW + 30 * MIN;
      await runAlarm(deps());
      db.set("t1", todo({ title: "바뀐 제목" })); // 발송 뒤 바뀌어도 기록은 그대로
      expect(store.listHistory(0, 50)).toEqual([
        { todoId: "t1", title: "보고서", offsetMinutes: 30, dueAt: iso(60 * MIN), sentAt: NOW + 30 * MIN },
      ]);
    });

    it("모든 기기 발송이 실패하면 기록하지 않는다", async () => {
      await runAlarm(deps());
      sendPush.mockRejectedValue(new TransientFcmError(503));
      now = NOW + 30 * MIN;
      await runAlarm(deps());
      expect(store.listHistory(0, 50)).toEqual([]);
    });

    it("보내지 않기로 한 예약(완료됨)은 기록하지 않는다", async () => {
      await runAlarm(deps());
      db.set("t1", todo({ status: "done" }));
      now = NOW + 30 * MIN;
      await runAlarm(deps());
      expect(store.listHistory(0, 50)).toEqual([]);
    });

    // Review Focus 5
    it("재시도 끝에 성공해도 기록은 1건이다", async () => {
      await runAlarm(deps());
      sendPush.mockRejectedValueOnce(new TransientFcmError(503));
      now = NOW + 30 * MIN;
      await runAlarm(deps());
      now += ALARM_RETRY_MS;
      await runAlarm(deps());
      await runAlarm(deps());
      expect(store.listHistory(0, 50)).toHaveLength(1);
      expect(store.listHistory(0, 50)[0].sentAt).toBe(NOW + 30 * MIN + ALARM_RETRY_MS);
    });

    it("알람이 돌 때 7일 지난 기록을 정리한다", async () => {
      store.addHistory(
        { todoId: "old", title: "옛 알림", offsetMinutes: 30, dueAt: iso(0), sentAt: NOW - HISTORY_RETENTION_MS - 1 },
        1,
      );
      await runAlarm(deps());
      expect(store.history.size).toBe(0);
    });
  });
});
