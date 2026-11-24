import { describe, it, expect, vi } from "vitest";
import { notifyDiscord } from "../discord";

const URL = "https://discord.com/api/webhooks/x/y";

describe("notifyDiscord", () => {
  it("웹훅 URL로 내용 없는 본문을 POST한다", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    await notifyDiscord(URL, "ios", "https://tododo-app.com", fetchFn as unknown as typeof fetch);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      content: "새 의견 1건 (ios)\nhttps://tododo-app.com/admin/feedback",
      allowed_mentions: { parse: [] },
    });
  });

  it("2xx가 아니면 throw한다", async () => {
    const fetchFn = vi.fn(async () => new Response("", { status: 429 }));
    await expect(
      notifyDiscord(URL, "web", "https://tododo-app.com", fetchFn as unknown as typeof fetch),
    ).rejects.toThrow("Discord 알림 실패 (429)");
  });
});
