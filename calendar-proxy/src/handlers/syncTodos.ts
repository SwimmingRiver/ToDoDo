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

export const handleSyncTodos = async (request: Request, env: Env): Promise<Response> => {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!idToken) return new Response("Unauthorized", { status: 401 });

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const tokenRecord = await getTokenRecord(env.CALENDAR_TOKENS, uid);
  if (!tokenRecord) {
    return jsonResponse({ error: "not_connected" }, 409);
  }

  const { todos } = (await request.json()) as { todos: SyncTodoItem[] };

  let accessToken: string;
  try {
    const refreshed = await refreshAccessToken(
      tokenRecord.refreshToken,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    );
    accessToken = refreshed.access_token;
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_grant") {
      await deleteTokenRecord(env.CALENDAR_TOKENS, uid);
      return jsonResponse({ error: "revoked" }, 401);
    }
    return jsonResponse({ error: "google_api_error" }, 502);
  }

  const results = await syncTodosToGoogleCalendar(todos, accessToken);
  return jsonResponse({ results });
};
