export interface Env {
  FIREBASE_PROJECT_ID: string;
  CLIENT_APP_URL: string;
  /** 서비스 계정 JSON 문자열(wrangler secret). */
  GOOGLE_SERVICE_ACCOUNT: string;
  /** Discord 웹훅 URL(wrangler secret). */
  DISCORD_WEBHOOK_URL: string;
  /** 같은 uid 제출 제한(wrangler.toml [[ratelimits]], 60초 3회). 없으면 건너뛴다. */
  FEEDBACK_SUBMIT_LIMIT?: RateLimit;
  /** 전역 Discord 알림 제한(60초 10건). 없으면 건너뛴다. */
  FEEDBACK_NOTIFY_LIMIT?: RateLimit;
}
