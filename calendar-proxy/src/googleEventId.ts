// Google Calendar 이벤트 id는 클라이언트가 직접 지정할 수 있다(오프라인 동기화 클라이언트를
// 위한 기능). 허용 문자셋은 소문자 base32hex(0-9, a-v)이고 길이는 5~1024자여야 한다.
// 같은 id로 다시 insert를 시도하면 409 Conflict를 반환하므로, Todo 문서 id로부터 결정론적
// id를 만들어두면 여러 탭이 동시에 같은 Todo를 최초 동기화해도 구글 쪽에서 하나의 이벤트로
// 수렴한다(반복 할 일 인스턴스 문서 id를 결정론적으로 고정해 멀티탭 레이스를 없앤 것과 동일한
// 원리 — client/src/features/todo/utils/recurrence.ts의 buildRecurringInstanceId 참고).
//
// 16진수(0-9a-f)는 base32hex 문자셋(0-9a-v)의 부분집합이므로, SHA-256 다이제스트를 소문자
// hex로 인코딩하면 자동으로 문자셋 제약을 만족한다(64자, 길이 제약 범위 안).
const NAMESPACE = "tododo:googleCalendarEvent:v1";

export const deriveGoogleCalendarEventId = async (todoId: string): Promise<string> => {
  const data = new TextEncoder().encode(`${NAMESPACE}:${todoId}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
