// Apple 로그인 공개 시각(약관 4판 시행일, KST).
export const APPLE_LOGIN_OPENS_AT = "2026-12-28T00:00:00+09:00";

// VITE_APPLE_LOGIN_PREVIEW=true는 로컬 실기 확인용이다. 운영 env에는 넣지 않는다.
export const isAppleLoginOpen = (now: Date = new Date()): boolean =>
  import.meta.env.VITE_APPLE_LOGIN_PREVIEW === "true" || now.getTime() >= new Date(APPLE_LOGIN_OPENS_AT).getTime();
