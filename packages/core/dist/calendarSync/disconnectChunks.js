import { chunkSyncBatch } from "./cooldown.js";
/** /disconnect 한 요청에 담는 이벤트 수. 삭제는 이벤트당 구글 호출 1회(레이트 리밋 시 최대
 *  3회)라 10 × 3 + JWKS·토큰 갱신으로 무료 플랜 서브리퀘스트 50 한도 안에 든다. */
export const DISCONNECT_CHUNK_SIZE = 10;
/** 묶음 연동 해제 도중 요청이 실패했다. 그때까지 구글에서 삭제 확인된 id를 담는다(진단·로그용).
 *  호출부는 부분 실패 시 Firestore를 건드리지 않아야 한다 — 토큰은 마지막 요청에서만 지우므로
 *  연동이 아직 유지 중인데, 이때 googleEventId를 지우면 다음 동기화가 그 할 일 전부를 미동기화로
 *  보고 POST→409→tombstone 되살리기로 삭제를 되돌린다. 연동 해제 상태로도 바꾸지 말고 그대로
 *  던져 사용자가 다시 시도하게 한다 — 재시도한 연동 해제는 이미 지워진 이벤트의 404/410을
 *  성공으로 처리해 정리한다. message는 원래 오류 그대로라 기존 오류 문구가 바뀌지 않는다. */
export class DisconnectPartialError extends Error {
    constructor(cause, deletedGoogleEventIds) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.name = "DisconnectPartialError";
        this.cause = cause;
        this.deletedGoogleEventIds = deletedGoogleEventIds;
    }
}
/** 이벤트 id를 묶음으로 나눠 /disconnect를 순서대로 부른다. 마지막 요청 전까지는
 *  keepToken=true로 토큰을 남겨 다음 묶음도 지울 수 있게 하고, 마지막 요청(남은 묶음 또는
 *  빈 목록)에서만 토큰을 지운다. 중간 요청이 실패하면 멈추고 DisconnectPartialError를 던진다 —
 *  토큰이 아직 남아 있어 사용자가 다시 시도할 수 있다. deletedGoogleEventIds는 모든 요청 결과를 합친다. */
export const disconnectInChunks = async (googleEventIds, send, size = DISCONNECT_CHUNK_SIZE) => {
    const chunks = chunkSyncBatch(googleEventIds, size);
    if (chunks.length === 0)
        chunks.push([]);
    const deletedGoogleEventIds = [];
    for (const [index, chunk] of chunks.entries()) {
        const isLast = index === chunks.length - 1;
        let result;
        try {
            result = await send(chunk, !isLast);
        }
        catch (error) {
            throw new DisconnectPartialError(error, [...deletedGoogleEventIds]);
        }
        deletedGoogleEventIds.push(...result.deletedGoogleEventIds);
    }
    return { deletedGoogleEventIds };
};
