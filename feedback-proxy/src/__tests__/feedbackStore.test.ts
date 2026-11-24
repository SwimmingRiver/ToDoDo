import { describe, it, expect, vi } from "vitest";
import { FeedbackStore, type NewFeedback } from "../feedbackStore";

const getToken = async () => "tok";
const DOC: NewFeedback = {
  userId: "u1",
  email: null,
  content: "좋아요",
  platform: "ios",
  createdAt: "2026-11-23T00:00:00.000Z",
};

describe("FeedbackStore.create", () => {
  it("feedback 컬렉션에 POST하고 status를 new로 넣는다", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    await new FeedbackStore("p", getToken, fetchFn as unknown as typeof fetch).create(DOC);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents/feedback");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string).fields).toEqual({
      userId: { stringValue: "u1" },
      email: { nullValue: null },
      content: { stringValue: "좋아요" },
      platform: { stringValue: "ios" },
      status: { stringValue: "new" },
      createdAt: { stringValue: "2026-11-23T00:00:00.000Z" },
    });
  });

  it("email이 문자열이면 stringValue로 쓴다", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    await new FeedbackStore("p", getToken, fetchFn as unknown as typeof fetch).create({ ...DOC, email: "a@b.com" });
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).fields.email).toEqual({ stringValue: "a@b.com" });
  });

  it("응답이 실패면 상태 코드를 담아 reject한다", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 500 }));
    await expect(
      new FeedbackStore("p", getToken, fetchFn as unknown as typeof fetch).create(DOC),
    ).rejects.toThrow("Firestore 의견 저장 실패 (500)");
  });
});
