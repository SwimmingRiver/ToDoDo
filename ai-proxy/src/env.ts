export interface Env {
  AI_USAGE: KVNamespace;
  FIREBASE_PROJECT_ID: string;
  CLIENT_APP_URL: string;
  AI_MODEL: string;
  /** wrangler vars는 문자열이다. 숫자 변환은 handlers/plan.ts에서 한다. */
  DAILY_LIMIT: string;
  ANTHROPIC_API_KEY: string;
  /** 같은 uid 몰아치기 차단(wrangler.toml [[ratelimits]], 10초 3회). 없으면 건너뛴다. */
  AI_RATE_LIMIT?: RateLimit;
  /** Claude까지 간 시도(실패 포함) 하루 상한. 숫자 변환은 handlers/plan.ts에서 한다. */
  DAILY_ATTEMPT_LIMIT?: string;
}
