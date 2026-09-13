import type { Env } from "../env";
import { verifyFirebaseIdToken } from "../auth";
import { getTokenRecord, deleteTokenRecord } from "../tokenStore";
import { refreshAccessToken } from "../googleOAuth";
import { syncTodosToGoogleCalendar, type SyncTodoItem } from "../googleCalendar";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const handleDisconnect = async (request: Request, env: Env): Promise<Response> => {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const tokenRecord = await getTokenRecord(env.CALENDAR_TOKENS, uid);
  if (!tokenRecord) {
    return jsonResponse({ ok: true, deletedGoogleEventIds: [] });
  }

  // 실제로 구글에서 지워졌다고 확인된(또는 이미 없었던) id만 담는다 — 호출부가
  // 이 목록만 믿고 Firestore의 googleEventId를 정리해야, 실패한 항목의 옛
  // id가 다음 연동 해제 때도 계속 다시 삭제 대상에 끼어드는 걸 막을 수 있다.
  let deletedGoogleEventIds: string[] = [];

  // 요청 바디 파싱(빈 바디, 잘못된 JSON, googleEventIds 누락)까지 이 try 안에
  // 넣는다 — "연동 해제는 반드시 끝까지 진행된다"는 불변식이 구글 API 실패뿐
  // 아니라 바디 파싱 실패에도 깨지면 안 되기 때문이다. 파싱에 실패하면 삭제할
  // 이벤트가 없다고 보고 빈 배열로 진행한다.
  try {
    const { googleEventIds } = (await request.json().catch(() => ({}))) as {
      googleEventIds?: string[];
    };
    const refreshed = await refreshAccessToken(
      tokenRecord.refreshToken,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    );
    const deleteItems: SyncTodoItem[] = (googleEventIds ?? []).map((googleEventId) => ({
      id: googleEventId,
      title: "",
      dueAt: "",
      googleEventId,
      action: "delete" as const,
    }));
    const results = await syncTodosToGoogleCalendar(deleteItems, refreshed.access_token);
    // id 필드는 disconnect가 만든 deleteItems에서 googleEventId 그 자체로
    // 채웠으므로(별도 todo id가 없다), 에러 없는 결과의 id가 곧 삭제 확인된
    // googleEventId다.
    deletedGoogleEventIds = results.filter((r) => !r.error).map((r) => r.id);
  } catch (error) {
    // 토큰이 이미 철회됐거나 구글 API가 실패해도 ToDoDo 쪽 연동 해제는 반드시
    // 끝까지 진행한다 — 사용자 입장에서 "연동 끊기"가 안 되면 안 되고,
    // 구글 쪽 이벤트 정리는 최선 노력(best-effort)일 뿐이다.
    console.error("연동 해제 중 이벤트 삭제 실패:", error);
  }

  await deleteTokenRecord(env.CALENDAR_TOKENS, uid);
  return jsonResponse({ ok: true, deletedGoogleEventIds });
};
