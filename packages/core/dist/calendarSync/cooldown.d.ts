import type { Todo } from "../types/todo.js";
import type { SyncTodoPayload, SyncTodoResult } from "./types.js";
/** 최근 동기화에 실패한 항목. updatedAt은 실패 당시 Todo의 updatedAt이고, 삭제 항목
 *  (대상 목록에 없는 id)이면 빈 문자열이다. 메모리에만 두고 저장하지 않는다 — 앱을 다시
 *  열면 바로 재시도해도 된다. */
export type SyncFailureLog = Map<string, {
    updatedAt: string;
    retryAfter: number;
}>;
export declare const DEFAULT_SYNC_FAILURE_COOLDOWN_MS: number;
export declare const excludeCoolingDown: (payloads: SyncTodoPayload[], eligibleById: Map<string, Todo>, failures: SyncFailureLog, now: number) => SyncTodoPayload[];
/** 요청한 batch의 결과로 실패 기록을 제자리 갱신한다. 실패는 쿨다운을 걸고, 성공은 지운다. */
export declare const recordSyncFailures: (batch: SyncTodoPayload[], results: SyncTodoResult[], eligibleById: Map<string, Todo>, failures: SyncFailureLog, now: number, cooldownMs?: number) => void;
/** /sync-todos 한 요청에 담는 항목 수. Cloudflare Workers 무료 플랜은 요청당 서브리퀘스트가
 *  50개라, 항목당 최악 9회(POST·409·GET·되살리기 PATCH와 레이트 리밋 재시도) × 5 + JWKS·토큰
 *  갱신 ≈ 47로 한도 안에 들게 한다. (Worker도 요청당 구글 호출 예산 44로 한 번 더 막는다.) */
export declare const SYNC_CHUNK_SIZE = 5;
/** 한 요청에 수십 건을 몰아 보내지 않도록 batch를 나눈다. 호출부는 순서대로 await한다. */
export declare const chunkSyncBatch: <T>(items: T[], size?: number) => T[][];
