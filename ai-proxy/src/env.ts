export interface Env {
  AI_USAGE: KVNamespace;
  FIREBASE_PROJECT_ID: string;
  CLIENT_APP_URL: string;
  AI_MODEL: string;
  /** wrangler vars는 문자열이다. 숫자 변환은 handlers/plan.ts에서 한다. */
  DAILY_LIMIT: string;
  ANTHROPIC_API_KEY: string;
}
