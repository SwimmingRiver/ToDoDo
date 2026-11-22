export const DEFAULT_SYNC_FAILURE_COOLDOWN_MS = 5 * 60000;
const updatedAtOf = (id, eligibleById) => eligibleById.get(id)?.updatedAt ?? "";
// 실패 항목은 스냅샷에 안 들어가 planCalendarSync가 매번 다시 잡는다. 앱은 todos를
// 주기적으로 다시 받으므로, 쿨다운 없이 두면 레이트 리밋으로 실패한 항목을 재조회마다
// 즉시 다시 보내 403 폭주가 났다(11-21, 할 일 하나가 최대 7번). 사용자가 그 할 일을
// 수정했으면(updatedAt 변경) 새 변경이므로 쿨다운과 무관하게 바로 보낸다.
export const excludeCoolingDown = (payloads, eligibleById, failures, now) => payloads.filter((p) => {
    const failure = failures.get(p.id);
    if (!failure)
        return true;
    if (now >= failure.retryAfter)
        return true;
    return failure.updatedAt !== updatedAtOf(p.id, eligibleById);
});
/** 요청한 batch의 결과로 실패 기록을 제자리 갱신한다. 실패는 쿨다운을 걸고, 성공은 지운다. */
export const recordSyncFailures = (batch, results, eligibleById, failures, now, cooldownMs = DEFAULT_SYNC_FAILURE_COOLDOWN_MS) => {
    const requested = new Set(batch.map((p) => p.id));
    for (const { id, error } of results) {
        if (!requested.has(id))
            continue;
        if (error)
            failures.set(id, { updatedAt: updatedAtOf(id, eligibleById), retryAfter: now + cooldownMs });
        else
            failures.delete(id);
    }
};
/** /sync-todos 한 요청에 담는 항목 수. Cloudflare Workers 무료 플랜은 요청당 서브리퀘스트가
 *  50개라, 항목당 최악 9회(POST·409·GET·되살리기 PATCH와 레이트 리밋 재시도) × 5 + JWKS·토큰
 *  갱신 ≈ 47로 한도 안에 들게 한다. (Worker도 요청당 구글 호출 예산 44로 한 번 더 막는다.) */
export const SYNC_CHUNK_SIZE = 5;
/** 한 요청에 수십 건을 몰아 보내지 않도록 batch를 나눈다. 호출부는 순서대로 await한다. */
export const chunkSyncBatch = (items, size = SYNC_CHUNK_SIZE) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size)
        chunks.push(items.slice(i, i + size));
    return chunks;
};
