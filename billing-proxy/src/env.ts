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
  // 아래 스토어(Apple·Google) 시크릿은 스토어 계정 준비 전까지 비어 있을 수 있다 — deps.ts가 처음 쓸 때 읽어 스토어 경로만 실패시킨다.
  /** appAccountToken(uid 기반 UUID)을 만드는 HMAC 키. 바꾸면 이미 발급된 토큰과 달라지므로 고정해 둔다. */
  IAP_ACCOUNT_TOKEN_SECRET: string;
  /** App Store Server API 호출용. APPLE_PRIVATE_KEY는 .p8 파일 내용(PKCS#8 PEM) 전체. */
  APPLE_BUNDLE_ID: string;
  APPLE_ISSUER_ID: string;
  APPLE_KEY_ID: string;
  APPLE_PRIVATE_KEY: string;
  /**
   * "true"일 때만 CONSUMPTION_REQUEST(환불 요청)에 이용 정보·환불 선호를 회신한다. Apple은 고객 동의 없이는
   * 회신하지 말라고 하므로, 개인정보처리방침에 고지하기 전까지는 "false"로 두고 로그만 남긴다.
   */
  APPLE_CONSUMPTION_REPLY_ENABLED?: string;
  /** Play Developer API용. 패키지명과, 기존 계정과 분리한 Play 전용 서비스 계정 JSON 전체. */
  GOOGLE_PLAY_PACKAGE_NAME: string;
  GOOGLE_PLAY_SERVICE_ACCOUNT: string;
  /** Pub/Sub 푸시 구독의 OIDC 토큰 audience(푸시 엔드포인트 URL)와 토큰을 서명하는 서비스 계정 이메일. */
  GOOGLE_PUBSUB_AUDIENCE: string;
  GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL: string;
}
