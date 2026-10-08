import { BarChart3, CalendarDays, Sparkles, type LucideIcon } from "lucide-react";

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

/** 프리미엄 혜택. 랜딩 요금제 섹션과 /premium이 같은 목록을 보여준다. */
export const PREMIUM_BENEFITS: readonly { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Sparkles, title: "AI 할 일 플랜", description: "목표를 적으면 실행 단계와 날짜를 나눠 제안해요" },
  { icon: CalendarDays, title: "구글 캘린더 연동", description: "할 일을 구글 캘린더에 동기화해요" },
  { icon: BarChart3, title: "완료 통계", description: "완료율·연속 달성일·우선순위 분포를 확인해요" },
];
