// 같은 이메일이 다른 로그인 방식으로 이미 가입된 경우
export function isAccountExistsError(code: unknown): boolean {
  return code === "auth/account-exists-with-different-credential";
}

const CANCELLED_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "ERR_REQUEST_CANCELED", // 앱(expo-apple-authentication) 취소
]);

// 사용자가 로그인 창을 닫거나 취소한 경우(오류 안내 불필요)
export function isUserCancelledSignIn(code: unknown): boolean {
  return typeof code === "string" && CANCELLED_CODES.has(code);
}
