import { reminderBody } from "@tododo/core/dist/reminders/index.js";
import type { FirestoreClient } from "./firestore";
import type { PushMessage, SendResult } from "./fcm";
import { computeSchedule, shouldSend, LATE_GRACE_MS, QUERY_SPAN_MS, WINDOW_MS, type ReminderTodo, type ScheduleEntry } from "./schedule";
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

/** 재계산 중에 새 refresh 신호가 도착했을 때 다시 계산할 때까지의 지연. */
export const REFRESH_RETRY_MS = 5_000;

/**
 * 발송·조회가 실패했을 때 다시 시도할 때까지의 지연.
 * 실패를 던져 런타임 재시도에 맡기면 약 2분(6회) 뒤 포기하고 다음 알람도 걸리지 않아,
 * 사용자가 앱을 다시 열 때까지 이후 알림이 전부 멈춘다. 그래서 던지지 않고 직접 다시 건다.
 * 계속 실패하는 예약은 마감 + 유예가 지나면 버려지므로 재시도가 무한히 이어지지 않는다.
 */
export const ALARM_RETRY_MS = 60_000;

/**
 * Firestore에서 창 안의 할 일과 기본값을 읽어 예약표를 통째로 교체한다.
 *
 * pending은 조회 "전에" 내린다. DO 입력 게이트는 await 동안 다른 RPC를 들여보내므로,
 * 조회 중에 도착한 requestRefresh가 pending=1을 세우면 그 값이 끝까지 남아 runAlarm이
 * 곧 다시 계산한다(조회 뒤에 내리면 그 신호를 덮어써 잃는다).
 * 조회가 실패하면 pending을 다시 세우고 던져 runAlarm이 재시도 알람을 걸게 한다.
 *
 * retained는 이번 실행에서 발송이 실패해 재시도를 기다리는 예약이다. fireAt이 이미 지나
 * computeSchedule이 걸러내므로 따로 넘겨 살린다. 같은 할 일의 새 예약보다 우선한다 —
 * 마감이 바뀌었다면 재시도 때 shouldSend가 dueAtChanged로 판단해 다시 계산한다.
 */
export const refreshSchedule = async (
  deps: AlarmDeps,
  now: number,
  retained: ScheduleEntry[] = [],
): Promise<void> => {
  deps.store.setMeta("refreshPending", "0");
  let todos: ReminderTodo[];
  let userDefault: unknown;
  try {
    [todos, userDefault] = await Promise.all([
      deps.firestore.queryUpcomingTodos(
        deps.uid,
        new Date(now).toISOString(),
        new Date(now + QUERY_SPAN_MS).toISOString(),
      ),
      deps.firestore.getReminderDefault(deps.uid),
    ]);
  } catch (error) {
    deps.store.setMeta("refreshPending", "1");
    throw error;
  }
  const retainedIds = new Set(retained.map((e) => e.todoId));
  const computed = computeSchedule(todos, userDefault, now).filter((e) => !retainedIds.has(e.todoId));
  deps.store.replaceSchedule([...retained, ...computed]);
  deps.store.setMeta("windowEnd", String(now + WINDOW_MS));
};

/**
 * 모든 토큰으로 보낸다. 무효 토큰은 지운다. 한 기기라도 받았으면 성공으로 본다 —
 * 에러 종류(일시적이든 아니든)와 무관하게, 이미 받은 기기가 있는 채로 다시 던지면
 * 재시도 때 그 기기에 중복으로 간다. 그래서 개별 토큰 에러는 항상 로그만 남기고
 * 삼키며, 한 기기도 받지 못했을 때만 첫 에러를 던져 runAlarm이 그 예약만 남겨 재시도하게 한다.
 */
const deliver = async (deps: AlarmDeps, entry: ScheduleEntry, title: string): Promise<void> => {
  // 서버가 보내기 전에 적용하는 "마감 + 유예 이후는 버린다"(shouldSend) 규칙을 FCM 보관 구간에도
  // 똑같이 적용한다. shouldSend를 통과했으므로 음수가 되지 않지만 방어적으로 0에서 자른다.
  const ttlSeconds = Math.max(0, Math.floor((Date.parse(entry.dueAt) + LATE_GRACE_MS - deps.now()) / 1000));
  let delivered = 0;
  let firstError: unknown = null;
  for (const token of deps.store.listTokens()) {
    try {
      const result = await deps.sendPush({
        token,
        title,
        body: reminderBody(entry.offsetMinutes),
        link: `${deps.appUrl}/todo/${encodeURIComponent(entry.todoId)}`,
        todoId: entry.todoId,
        ttlSeconds,
      });
      if (result === "invalidToken") deps.store.deleteToken(token);
      else delivered += 1;
    } catch (error) {
      console.error(`FCM 발송 실패 (todo ${entry.todoId}):`, error);
      if (firstError === null) firstError = error;
    }
  }
  if (delivered === 0 && firstError) throw firstError;
};

/**
 * 알람 1회 처리. 반환값은 다음 알람 시각(걸 필요 없으면 null).
 *
 * 순서가 중요하다: 기존 예약표의 due 항목부터 먼저 처리하고, 그 다음에 재계산한다.
 * 반대로 하면(재계산 먼저) computeSchedule이 fireAt <= now인 항목을 걸러내므로,
 * 알람이 늦게 울렸거나 실패한 재계산의 재시도가 겹치는 순간에 아직 보내지 않은
 * 알림이 재계산 한 번으로 조용히 사라진다(5분 유예가 전혀 적용되지 못함).
 * due 처리 중 shouldSend가 dueAtChanged로 판단하면 그 자리에서 refreshPending을
 * 세워, 같은 실행 안에서 바로 재계산해 새 시각으로 재예약되게 한다.
 *
 * 실패는 던지지 않는다(ALARM_RETRY_MS 참고). 실패한 예약은 지우지 않고 남겨 다음 실행에서
 * 다시 시도하고, 같은 실행의 나머지 예약은 계속 처리한다.
 */
export const runAlarm = async (deps: AlarmDeps): Promise<number | null> => {
  const { store } = deps;
  const now = deps.now();

  // 알림을 켠 기기가 없으면 아무것도 읽지 않는다(무료 한도 보호).
  if (store.listTokens().length === 0) {
    store.replaceSchedule([]);
    store.setMeta("refreshPending", "0");
    return null;
  }

  const failed: ScheduleEntry[] = [];
  for (const entry of store.dueEntries(now)) {
    // 재시도로 남아 있던 예약이 유예까지 넘겼으면 조회 없이 버린다(shouldSend의 tooLate와 같은 기준).
    const tooLate = now > Date.parse(entry.dueAt) + LATE_GRACE_MS;
    if (!tooLate && !store.isSent(entry.todoId, entry.fireAt)) {
      try {
        const current = await deps.firestore.getTodo(deps.uid, entry.todoId);
        const decision = shouldSend(entry, current, now);
        if (decision.send && current) {
          await deliver(deps, entry, current.title);
          store.markSent(entry.todoId, entry.fireAt, Date.parse(entry.dueAt));
        } else if (!decision.send && decision.reason === "dueAtChanged") {
          // 다른 기기에서 마감을 옮겼다 — 이 실행에서 바로 재계산해 새 시각으로 재예약한다.
          store.setMeta("refreshPending", "1");
        }
      } catch (error) {
        console.error(`알림 처리 실패, 재시도 예정 (todo ${entry.todoId}):`, error);
        failed.push(entry);
        continue; // 예약을 지우지 않고 남겨 다음 실행에서 다시 시도한다.
      }
    }
    store.deleteEntry(entry.todoId);
  }

  const windowEnd = Number(store.getMeta("windowEnd") ?? 0);
  if (store.getMeta("refreshPending") === "1" || now >= windowEnd) {
    try {
      await refreshSchedule(deps, now, failed);
    } catch (error) {
      console.error("예약표 재계산 실패, 재시도 예정:", error);
      return now + ALARM_RETRY_MS;
    }
  }

  store.pruneSent(now - DAY);

  // 실패해 남은 예약은 fireAt이 이미 지났으므로 nextFireAt에 그대로 넣으면 즉시 다시 울려
  // 헛돈다. 그 경우엔 재시도 시각으로 대신한다(그 사이 다른 예약은 최대 1분 늦어질 수 있다).
  const nextFire = failed.length > 0 ? now + ALARM_RETRY_MS : store.nextFireAt();
  const nextWindowEnd = Number(store.getMeta("windowEnd"));
  const next = nextFire === null ? nextWindowEnd : Math.min(nextFire, nextWindowEnd);
  // 재계산 도중 들어온 refresh 신호가 남아 있으면 곧 다시 계산한다. 그러지 않으면
  // requestRefresh가 건 짧은 알람을 호출자의 setAlarm(next)가 덮어써 신호를 잃는다.
  return store.getMeta("refreshPending") === "1" ? Math.min(next, now + REFRESH_RETRY_MS) : next;
};
