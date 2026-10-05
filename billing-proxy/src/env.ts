export interface Env {
  FIREBASE_PROJECT_ID: string;
  CLIENT_APP_URL: string;
  PADDLE_API_BASE: string;
  PADDLE_PRICE_ID: string;
  /** 쉼표 구분 uid. 비어 있으면 아무도 허용하지 않고 "*"면 전원 허용. */
  BILLING_ALLOWED_UIDS?: string;
  PADDLE_API_KEY: string;
  PADDLE_WEBHOOK_SECRET: string;
  /** 결제 전용 서비스 계정 JSON 전체(문자열). Firestore 쓰기 + Auth 커스텀 클레임 설정. */
  GOOGLE_SERVICE_ACCOUNT: string;
}
