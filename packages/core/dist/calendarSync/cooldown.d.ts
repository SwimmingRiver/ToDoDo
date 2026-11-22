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
/** Worker가 요청당 서브리퀘스트 예산이 바닥나 구글에 시도조차 안 한 항목의 오류 접두어
 *  (calendar-proxy GoogleFetchBudgetExhaustedError와의 계약). */
export declare const BUDGET_EXHAUSTED_ERROR_PREFIX = "budget_exhausted";
/** 요청한 batch의 결과로 실패 기록을 제자리 갱신한다. 실패는 쿨다운을 걸고, 성공은 지운다.
 *  예산 소진(구글에 시도 안 함)은 레이트 리밋과 무관하므로 쿨다운 없이 다음 실행에서 바로
 *  다시 보낸다. */
export declare const recordSyncFailures: (batch: SyncTodoPayload[], results: SyncTodoResult[], eligibleById: Map<string, Todo>, failures: SyncFailureLog, now: number, cooldownMs?: number) => void;
/** /sync-todos 한 요청에 담는 항목 수. Cloudflare Workers 무료 플랜은 요청당 서브리퀘스트가
 *  50개다. 항목당 구글 호출은 보통 1~4회지만, 레이트 리밋 재시도가 겹치면 PATCH→404→생성
 *  경로에서 최악 12회까지 갈 수 있어 묶음 크기만으로는 한도를 보장하지 못한다 — 그래서 묶음을
 *  5개로 줄여 대부분의 경우를 덜어 내고, 최종 보장은 Worker의 요청당 구글 호출 예산(44)이
 *  맡는다(44 + 토큰 갱신 1 + JWKS 최대 2 = 47). */
export declare const SYNC_CHUNK_SIZE = 5;
/** 한 요청에 수십 건을 몰아 보내지 않도록 batch를 나눈다. 호출부는 순서대로 await한다. */
export declare const chunkSyncBatch: <T>(items: T[], size?: number) => T[][];
