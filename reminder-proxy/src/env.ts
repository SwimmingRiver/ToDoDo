import type { ReminderScheduler } from "./scheduler";

export interface Env {
  REMINDER_SCHEDULER: DurableObjectNamespace<ReminderScheduler>;
  FIREBASE_PROJECT_ID: string;
  CLIENT_APP_URL: string;
  /** 서비스 계정 JSON 전체(문자열). Firestore 읽기 + FCM 발송에 쓴다. */
  GOOGLE_SERVICE_ACCOUNT: string;
}
