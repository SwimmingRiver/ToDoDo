import { hmacSha256Hex, timingSafeEqual } from "./hmac";

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

  return timingSafeEqual(await hmacSha256Hex(secret, `${ts}:${rawBody}`), h1);
};
