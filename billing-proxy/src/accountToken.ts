import { hmacSha256Hex } from "./hmac";

/**
 * 계정(uid)에서 결정론적으로 만드는 스토어용 appAccountToken(소문자 UUID v4 형식).
 * 저장하지 않고 매번 다시 만든다 — Apple appAccountToken·Google obfuscatedAccountId로 쓰여
 * 영수증이 어느 계정 것인지 서버가 확인하는 근거가 된다.
 */
export const deriveAccountToken = async (uid: string, secret: string): Promise<string> => {
  if (!secret) throw new Error("IAP_ACCOUNT_TOKEN_SECRET이 비어 있음");
  const hex = (await hmacSha256Hex(secret, uid)).slice(0, 32);
  // UUID v4 형식: 13번째 자리는 4, 17번째 자리는 상위 2비트를 10으로 맞춘다(8~b).
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const chars = `${hex.slice(0, 12)}4${hex.slice(13, 16)}${variant}${hex.slice(17)}`;
  return `${chars.slice(0, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}-${chars.slice(16, 20)}-${chars.slice(20)}`;
};
