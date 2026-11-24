import { verifyFirebaseIdToken } from "@tododo/worker-auth";
import type { Env } from "../env";
import { notifyDiscord } from "../discord";
import { FeedbackStore, type Platform } from "../feedbackStore";
import { GoogleTokenProvider, parseServiceAccount } from "../googleAuth";
import { errorResponse, jsonResponse } from "../http";

export const FEEDBACK_CONTENT_MAX_LENGTH = 1000;
const PLATFORMS: readonly Platform[] = ["web", "ios", "android"];

export interface FeedbackDeps {
  store?: Pick<FeedbackStore, "create">;
  notify?: typeof notifyDiscord;
  now?: () => Date;
}

// 토큰 캐시를 요청 사이에 재사용하도록 모듈 범위에서 지연 생성한다.
let tokenProvider: GoogleTokenProvider | undefined;
const defaultStore = (env: Env): FeedbackStore => {
  tokenProvider ??= new GoogleTokenProvider(parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT));
  const provider = tokenProvider;
  return new FeedbackStore(env.FIREBASE_PROJECT_ID, () => provider.getToken());
};

const parseBody = (body: unknown): { content: string; platform: Platform } | null => {
  if (typeof body !== "object" || body === null) return null;
  const { content, platform } = body as Record<string, unknown>;
  if (typeof content !== "string") return null;
  if (typeof platform !== "string" || !PLATFORMS.includes(platform as Platform)) return null;
  const trimmed = content.trim();
  if (trimmed.length < 1 || trimmed.length > FEEDBACK_CONTENT_MAX_LENGTH) return null;
  return { content: trimmed, platform: platform as Platform };
};

/** 바인딩이 없거나 장애면 통과시킨다(fail-open, ai-proxy와 동일). */
const isLimited = async (limiter: RateLimit | undefined, key: string): Promise<boolean> => {
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit({ key });
    return !success;
  } catch (error) {
    console.error("연타 제한 확인 실패, 통과시킴:", error);
    return false;
  }
};

/**
 * 인증 → 입력 검증 → uid별 제출 제한 → 저장 → 전역 알림 제한 → Discord 알림.
 * 저장 실패는 throw해 index가 500으로 바꾸게 하고, Discord 실패는 의견이 이미 저장됐으므로 삼킨다.
 */
export const handleFeedback = async (
  request: Request,
  env: Env,
  deps: FeedbackDeps = {},
): Promise<Response> => {
  const idToken = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");

  let uid: string;
  let email: string | undefined;
  try {
    ({ uid, email } = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID));
  } catch {
    return errorResponse("UNAUTHORIZED", 401);
  }

  const parsed = parseBody(await request.json().catch(() => null));
  if (!parsed) return errorResponse("INVALID_INPUT", 400);

  if (await isLimited(env.FEEDBACK_SUBMIT_LIMIT, uid)) return errorResponse("TOO_FREQUENT", 429);

  const store = deps.store ?? defaultStore(env);
  const now = deps.now ?? (() => new Date());
  await store.create({
    userId: uid,
    email: email ?? null,
    content: parsed.content,
    platform: parsed.platform,
    createdAt: now().toISOString(),
  });

  if (!(await isLimited(env.FEEDBACK_NOTIFY_LIMIT, "global"))) {
    try {
      await (deps.notify ?? notifyDiscord)(env.DISCORD_WEBHOOK_URL, parsed.platform, env.CLIENT_APP_URL);
    } catch (error) {
      console.error("Discord 알림 실패, 의견은 저장됨:", error);
    }
  }

  return jsonResponse({ ok: true }, 201);
};
