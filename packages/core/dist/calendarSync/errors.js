/** Worker가 리프레시 토큰 철회(invalid_grant)를 감지하면 401 `{error:"revoked"}`를
 *  반환한다. 일반 401(잘못된 ID Token)과 구분해야 호출부가 "다시
 *  연결해주세요" 상태로 전환할지 판단할 수 있으므로, 이 경우만 별도 에러
 *  타입으로 구분해서 던진다. */
export class CalendarRevokedError extends Error {
    constructor() {
        super("구글 캘린더 연동이 해제되었습니다");
        this.name = "CalendarRevokedError";
    }
}
/** Worker는 토큰 레코드가 없으면(연동 해제 뒤) 409 {error:"not_connected"}를 준다.
 *  다른 탭에서 해제한 뒤 이 탭의 연동 캐시가 stale할 때 만나는 정상 경로라
 *  Sentry 오탐이 되지 않도록 별도 타입으로 구분한다. */
export class CalendarNotConnectedError extends Error {
    constructor() {
        super("구글 캘린더가 연동되어 있지 않습니다");
        this.name = "CalendarNotConnectedError";
    }
}
