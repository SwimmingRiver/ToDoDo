import type { Todo } from "../types/todo.js";
import type { SyncTodoPayload, SyncTodoResult } from "./types.js";

/** 최근 동기화에 실패한 항목. updatedAt은 실패 당시 Todo의 updatedAt이고, 삭제 항목
 *  (대상 목록에 없는 id)이면 빈 문자열이다. 메모리에만 두고 저장하지 않는다 — 앱을 다시
 *  열면 바로 재시도해도 된다. */
export type SyncFailureLog = Map<string, { updatedAt: string; retryAfter: number }>;

export const DEFAULT_SYNC_FAILURE_COOLDOWN_MS = 5 * 60_000;

const updatedAtOf = (id: string, eligibleById: Map<string, Todo>): string => eligibleById.get(id)?.updatedAt ?? "";

// 실패 항목은 스냅샷에 안 들어가 planCalendarSync가 매번 다시 잡는다. 앱은 todos를
// 주기적으로 다시 받으므로, 쿨다운 없이 두면 레이트 리밋으로 실패한 항목을 재조회마다
// 즉시 다시 보내 403 폭주가 났다(11-21, 할 일 하나가 최대 7번). 사용자가 그 할 일을
// 수정했으면(updatedAt 변경) 새 변경이므로 쿨다운과 무관하게 바로 보낸다.
export const excludeCoolingDown = (
  payloads: SyncTodoPayload[],
  eligibleById: Map<string, Todo>,
  failures: SyncFailureLog,
  now: number,
): SyncTodoPayload[] =>
  payloads.filter((p) => {
    const failure = failures.get(p.id);
    if (!failure) return true;
    if (now >= failure.retryAfter) return true;
    return failure.updatedAt !== updatedAtOf(p.id, eligibleById);
  });

/** 요청한 batch의 결과로 실패 기록을 제자리 갱신한다. 실패는 쿨다운을 걸고, 성공은 지운다. */
export const recordSyncFailures = (
  batch: SyncTodoPayload[],
  results: SyncTodoResult[],
  eligibleById: Map<string, Todo>,
  failures: SyncFailureLog,
  now: number,
  cooldownMs: number = DEFAULT_SYNC_FAILURE_COOLDOWN_MS,
): void => {
  const requested = new Set(batch.map((p) => p.id));
  for (const { id, error } of results) {
    if (!requested.has(id)) continue;
    if (error) failures.set(id, { updatedAt: updatedAtOf(id, eligibleById), retryAfter: now + cooldownMs });
    else failures.delete(id);
  }
};

/** 한 요청에 수십 건을 몰아 보내지 않도록 batch를 나눈다. 호출부는 순서대로 await한다. */
export const chunkSyncBatch = <T>(items: T[], size = 10): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};
