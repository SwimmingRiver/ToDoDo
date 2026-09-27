import { reminderBody } from "@tododo/core/dist/reminders/index.js";
import type { FirestoreClient } from "./firestore";
import { TransientFcmError, type PushMessage, type SendResult } from "./fcm";
import { computeSchedule, shouldSend, QUERY_SPAN_MS, WINDOW_MS, type ScheduleEntry } from "./schedule";
import type { ReminderStore } from "./store";

const DAY = 24 * 60 * 60_000;

export interface AlarmDeps {
  store: ReminderStore;
  now: () => number;
  uid: string;
  firestore: Pick<FirestoreClient, "queryUpcomingTodos" | "getTodo" | "getReminderDefault">;
  sendPush: (message: PushMessage) => Promise<SendResult>;
  appUrl: string;
}

/** Firestore에서 창 안의 할 일과 기본값을 읽어 예약표를 통째로 교체한다.
 *  조회가 성공한 뒤에만 pending을 내린다 — 실패하면 알람 재시도가 다시 계산한다. */
export const refreshSchedule = async (deps: AlarmDeps, now: number): Promise<void> => {
  const [todos, userDefault] = await Promise.all([
    deps.firestore.queryUpcomingTodos(
      deps.uid,
      new Date(now).toISOString(),
      new Date(now + QUERY_SPAN_MS).toISOString(),
    ),
    deps.firestore.getReminderDefault(deps.uid),
  ]);
  deps.store.replaceSchedule(computeSchedule(todos, userDefault, now));
  deps.store.setMeta("windowEnd", String(now + WINDOW_MS));
  deps.store.setMeta("refreshPending", "0");
};

/**
 * 모든 토큰으로 보낸다. 무효 토큰은 지운다. 한 기기라도 받았으면 성공으로 보고
 * 나머지의 일시 실패는 로그만 남긴다 — 재시도하면 받은 기기에 중복으로 가기 때문이다.
 * 아무 기기도 받지 못했고 일시 실패가 있었으면 throw해서 알람 재시도에 맡긴다.
 */
const deliver = async (deps: AlarmDeps, entry: ScheduleEntry, title: string): Promise<void> => {
  let delivered = 0;
  let transient: unknown = null;
  for (const token of deps.store.listTokens()) {
    try {
      const result = await deps.sendPush({
        token,
        title,
        body: reminderBody(entry.offsetMinutes),
        link: `${deps.appUrl}/todo/${encodeURIComponent(entry.todoId)}`,
        todoId: entry.todoId,
      });
      if (result === "invalidToken") deps.store.deleteToken(token);
      else delivered += 1;
    } catch (error) {
      if (!(error instanceof TransientFcmError)) throw error;
      console.error(`FCM 일시 실패 (todo ${entry.todoId}):`, error);
      transient = error;
    }
  }
  if (delivered === 0 && transient) throw transient;
};

/** 알람 1회 처리. 반환값은 다음 알람 시각(걸 필요 없으면 null). */
export const runAlarm = async (deps: AlarmDeps): Promise<number | null> => {
  const { store } = deps;
  const now = deps.now();

  // 알림을 켠 기기가 없으면 아무것도 읽지 않는다(무료 한도 보호).
  if (store.listTokens().length === 0) {
    store.replaceSchedule([]);
    store.setMeta("refreshPending", "0");
    return null;
  }

  const windowEnd = Number(store.getMeta("windowEnd") ?? 0);
  if (store.getMeta("refreshPending") === "1" || now >= windowEnd) {
    await refreshSchedule(deps, now);
  }

  for (const entry of store.dueEntries(now)) {
    if (!store.isSent(entry.todoId, entry.fireAt)) {
      const current = await deps.firestore.getTodo(deps.uid, entry.todoId);
      const decision = shouldSend(entry, current, now);
      if (decision.send && current) {
        await deliver(deps, entry, current.title);
        store.markSent(entry.todoId, entry.fireAt, Date.parse(entry.dueAt));
      }
    }
    store.deleteEntry(entry.todoId);
  }

  store.pruneSent(now - DAY);

  const nextFire = store.nextFireAt();
  const nextWindowEnd = Number(store.getMeta("windowEnd"));
  return nextFire === null ? nextWindowEnd : Math.min(nextFire, nextWindowEnd);
};
