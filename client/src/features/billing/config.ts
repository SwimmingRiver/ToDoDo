/**
 * 진입점(잠금 안내 CTA·프로필 메뉴) 노출 여부. 운영 빌드에서는 실결제 전환 전까지 끈다.
 * 꺼져 있어도 /premium 라우트는 열려 있다 — 허용 목록 계정이 운영에서 샌드박스 결제를 확인하는 길.
 */
export const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === "true";
export const BILLING_PROXY_URL = (import.meta.env.VITE_BILLING_PROXY_URL as string | undefined) ?? "";
export const PADDLE_CLIENT_TOKEN = (import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined) ?? "";
export const PADDLE_ENV: "sandbox" | "production" =
  import.meta.env.VITE_PADDLE_ENV === "production" ? "production" : "sandbox";
/** 표시용. 실제 청구 금액은 billing-proxy의 PADDLE_PRICE_ID가 정한다 — Paddle 가격을 바꾸면 함께 바꾼다. */
export const PREMIUM_MONTHLY_PRICE_LABEL = "월 4,900원";
