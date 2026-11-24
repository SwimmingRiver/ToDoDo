import type { Platform } from "./feedbackStore";

/**
 * Discord 웹훅으로 새 의견 알림을 보낸다. 의견 내용·이메일·uid는 인자로 받지 않는다.
 * 2xx가 아니면 throw한다(호출 쪽에서 삼킨다).
 */
export async function notifyDiscord(
  webhookUrl: string,
  platform: Platform,
  appUrl: string,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<void> {
  const res = await fetchFn(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `새 의견 1건 (${platform})\n${appUrl}/admin/feedback`,
      // 멘션 파싱 차단
      allowed_mentions: { parse: [] },
    }),
  });
  if (!res.ok) throw new Error(`Discord 알림 실패 (${res.status})`);
}
