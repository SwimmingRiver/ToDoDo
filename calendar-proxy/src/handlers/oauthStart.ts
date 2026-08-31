import type { Env } from "../env";
import { verifyFirebaseIdToken } from "../auth";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const buildAuthUrl = (uid: string, redirectUri: string, clientId: string): string => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/calendar.events",
    state: uid,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

export const handleOAuthStart = async (request: Request, env: Env): Promise<Response> => {
  const authHeader = request.headers.get("Authorization") ?? "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");

  if (!idToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/oauth/callback`;
  const authUrl = buildAuthUrl(uid, redirectUri, env.GOOGLE_CLIENT_ID);

  return new Response(JSON.stringify({ authUrl }), {
    headers: { "Content-Type": "application/json" },
  });
};
