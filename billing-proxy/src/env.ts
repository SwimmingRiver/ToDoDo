export interface Env {
  FIREBASE_PROJECT_ID: string;
  CLIENT_APP_URL: string;
  PADDLE_API_BASE: string;
  PADDLE_PRICE_ID: string;
  /** 쉼표 구분 uid. 비어 있으면 아무도 허용하지 않고 "*"면 전원 허용. */
  BILLING_ALLOWED_UIDS?: string;
  PADDLE_API_KEY: string;
  PADDLE_WEBHOOK_SECRET: string;
  /**
   * /checkout이 custom_data.uid에 붙이는 HMAC 서명 키. 웹훅은 이 서명이 맞는 uid만 반영한다 —
   * 공개된 클라이언트 토큰으로 남의 uid를 넣어 결제창을 여는 위조를 막는다.
   */
  BILLING_UID_SECRET: string;
  /** 결제 전용 서비스 계정 JSON 전체(문자열). Firestore 쓰기 + Auth 커스텀 클레임 설정. */
  GOOGLE_SERVICE_ACCOUNT: string;
}
