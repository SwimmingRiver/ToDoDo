const enc = new TextEncoder();

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Paddle-Signature: ts=<unix초>;h1=<hex HMAC-SHA256("ts:원문 body")>.
 * 원문 body는 JSON.parse 전의 문자열 그대로여야 한다(공백 하나만 달라도 서명이 깨진다).
 */
export const verifyPaddleSignature = async (
  rawBody: string,
  header: string | null,
  secret: string,
  nowSec: number,
  toleranceSec = 300,
): Promise<boolean> => {
  if (!header || !secret) return false;
  const parts = new Map(
    header.split(";").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
    }),
  );
  const ts = Number(parts.get("ts"));
  const h1 = parts.get("h1");
  if (!Number.isInteger(ts) || !h1) return false;
  if (Math.abs(nowSec - ts) > toleranceSec) return false;

  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}:${rawBody}`)));
  return timingSafeEqual(toHex(signature), h1);
};
