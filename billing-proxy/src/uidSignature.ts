import { hmacSha256Hex, timingSafeEqual } from "./hmac";

/**
 * 웹훅의 custom_data.uid는 결제창을 연 쪽이 넣은 값이다. 클라이언트 토큰이 번들에 공개돼 있어
 * 누구나 devtools에서 임의 uid로 결제창을 열 수 있으므로, /checkout에서 서버가 만든 서명(uid_sig)이
 * 붙은 uid만 신뢰한다. 서명 키(BILLING_UID_SECRET)는 Worker에만 있다.
 */
export const signUid = async (uid: string, secret: string): Promise<string> => {
  // 빈 키로 서명하면 검증 쪽이 전부 거부해 결제가 조용히 반영되지 않는다 — 결제 전에 실패시킨다.
  if (!secret) throw new Error("BILLING_UID_SECRET이 설정되지 않음");
  return hmacSha256Hex(secret, uid);
};

export const verifyUidSignature = async (uid: string, sig: string | null, secret: string): Promise<boolean> => {
  if (!sig || !secret) return false;
  return timingSafeEqual(await hmacSha256Hex(secret, uid), sig);
};
