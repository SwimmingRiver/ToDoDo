/** Paddle과 같은 방식으로 서명 헤더를 만든다(테스트 전용). */
export const signForTest = async (body: string, secret: string, ts: number): Promise<string> => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}:${body}`)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  return `ts=${ts};h1=${hex}`;
};
