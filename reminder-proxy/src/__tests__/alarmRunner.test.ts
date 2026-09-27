import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAlarm, type AlarmDeps } from "../alarmRunner";
import { TransientFcmError, type PushMessage, type SendResult } from "../fcm";
import { WINDOW_MS, type ReminderTodo } from "../schedule";
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

  it("재계산 조회가 실패하면 pending을 유지한 채 throw(알람 재시도)", async () => {
    vi.mocked(firestore.queryUpcomingTodos).mockRejectedValueOnce(new Error("503"));
    await expect(runAlarm(deps())).rejects.toThrow("503");
    expect(store.getMeta("refreshPending")).toBe("1");
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

  it("모든 기기가 일시 실패면 sent에 기록하지 않고 throw(재시도)", async () => {
    sendPush.mockRejectedValue(new TransientFcmError(503));
    await runAlarm(deps());
    now = NOW + 30 * MIN;
    await expect(runAlarm(deps())).rejects.toBeInstanceOf(TransientFcmError);
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
});
