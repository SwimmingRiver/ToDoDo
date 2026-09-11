import type { Env } from "../env";
import { verifyFirebaseIdToken } from "../auth";
import { getTokenRecord, deleteTokenRecord } from "../tokenStore";
import { refreshAccessToken } from "../googleOAuth";

interface GoogleEventItem {
  id: string;
  summary?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const handleGetEvents = async (request: Request, env: Env): Promise<Response> => {
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
    return jsonResponse({ events: [] });
  }

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

  const requestUrl = new URL(request.url);
  const timeMin = requestUrl.searchParams.get("timeMin") ?? new Date().toISOString();
  const timeMax =
    requestUrl.searchParams.get("timeMax") ??
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const eventsUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  eventsUrl.searchParams.set("timeMin", timeMin);
  eventsUrl.searchParams.set("timeMax", timeMax);
  eventsUrl.searchParams.set("singleEvents", "true");

  const res = await fetch(eventsUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return jsonResponse({ error: "google_api_error" }, 502);
  }
  const data = (await res.json()) as { items: GoogleEventItem[] };

  const events = data.items.map((item) => ({
    id: item.id,
    title: item.summary ?? "(제목 없음)",
    start: item.start.date ?? item.start.dateTime ?? "",
    end: item.end.date ?? item.end.dateTime ?? "",
  }));

  return jsonResponse({ events });
};
