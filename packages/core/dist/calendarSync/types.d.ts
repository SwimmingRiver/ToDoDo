export interface SyncTodoPayload {
    id: string;
    title: string;
    /** "YYYY-MM-DD" 로컬 캘린더 날짜 키. ISO 타임스탬프가 아니다 — 호출부가
     *  planCalendarSync(toDateKeyFromISO)로 변환해서 채운다. */
    dueAt: string;
    googleEventId: string | null;
    action: "upsert" | "delete";
}
export interface SyncTodoResult {
    id: string;
    googleEventId: string | null;
    /** 이 항목이 실패했을 때만 채워진다. 있으면 googleEventId는 신뢰하지 말고,
     *  이 항목은 다음 동기화 실행에서 다시 시도되도록 둔다(스냅샷 갱신 안 함). */
    error?: string;
}
export interface GoogleCalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
}
export interface DisconnectResult {
    /** 구글에서 실제로 삭제(또는 이미 없었음) 확인된 이벤트 id만 담긴다 — 호출부는
     *  이 목록에 있는 것만 Firestore의 googleEventId를 지워야 한다. 실패한 항목의
     *  id까지 지우면, 구글에 여전히 남아있는 이벤트를 다음부터는 추적할 방법이
     *  없어진다. */
    deletedGoogleEventIds: string[];
}
/** 마지막으로 구글에 동기화한 상태의 스냅샷 항목. */
export interface SyncedSnapshotEntry {
    updatedAt: string;
    googleEventId: string | null;
}
export type SyncSnapshot = Map<string, SyncedSnapshotEntry>;
export interface CalendarIntegrationStatus {
    connected: boolean;
    status: "active" | "revoked";
}
