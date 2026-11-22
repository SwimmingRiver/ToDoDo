import { chunkSyncBatch } from "./cooldown.js";
/** /disconnect 한 요청에 담는 이벤트 수. 삭제는 이벤트당 구글 호출 1회(레이트 리밋 시 최대
 *  3회)라 10 × 3 + JWKS·토큰 갱신으로 무료 플랜 서브리퀘스트 50 한도 안에 든다. */
export const DISCONNECT_CHUNK_SIZE = 10;
/** 이벤트 id를 묶음으로 나눠 /disconnect를 순서대로 부른다. 마지막 요청 전까지는
 *  keepToken=true로 토큰을 남겨 다음 묶음도 지울 수 있게 하고, 마지막 요청(남은 묶음 또는
 *  빈 목록)에서만 토큰을 지운다. 중간 요청이 실패하면 멈추고 그대로 throw한다 — 토큰이 아직
 *  남아 있어 사용자가 다시 시도할 수 있다. deletedGoogleEventIds는 모든 요청 결과를 합친다. */
export const disconnectInChunks = async (googleEventIds, send, size = DISCONNECT_CHUNK_SIZE) => {
    const chunks = chunkSyncBatch(googleEventIds, size);
    if (chunks.length === 0)
        chunks.push([]);
    const deletedGoogleEventIds = [];
    for (const [index, chunk] of chunks.entries()) {
        const isLast = index === chunks.length - 1;
        const result = await send(chunk, !isLast);
        deletedGoogleEventIds.push(...result.deletedGoogleEventIds);
    }
    return { deletedGoogleEventIds };
};
