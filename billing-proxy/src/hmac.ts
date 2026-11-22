const enc = new TextEncoder();

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * hex 인코딩된 HMAC-SHA256. Paddle 웹훅 서명 검증, uid 서명, 체험 사용 확인값 키(trialHistory.ts)가 같이 쓴다.
 * 출력 형식(hex·SHA-256)을 바꾸면 이미 저장된 trialHistory 문서 id를 모두 못 찾게 되므로 바꾸지 않는다.
 */
export const hmacSha256Hex = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message))));
};

/** 서명 비교로 일치하는 앞부분 길이가 시간 차로 새지 않게 끝까지 비교한다. */
export const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
