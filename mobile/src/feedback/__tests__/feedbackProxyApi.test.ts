import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const getIdToken = jest.fn<() => Promise<string>>();
const mockAuth: { currentUser: { getIdToken: typeof getIdToken } | null } = { currentUser: { getIdToken } };
jest.mock("../../firebase", () => ({ get auth() { return mockAuth; } }));

const mockReportError = jest.fn();
jest.mock("../../shared/lib/sentry", () => ({ reportError: (...args: unknown[]) => mockReportError(...args) }));

describe("submitFeedback", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.EXPO_PUBLIC_FEEDBACK_PROXY_URL = "https://fb.example.com";
    mockAuth.currentUser = { getIdToken };
    getIdToken.mockReset();
    mockReportError.mockClear();
    getIdToken.mockResolvedValue("tok");
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("토큰을 실어 /feedback에 trim한 내용을 POST한다", async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({ ok: true, status: 201 } as Response);
    global.fetch = fetchMock;
    const { submitFeedback } = await import("../feedbackProxyApi");
    await submitFeedback("  좋아요  ");
    expect(fetchMock).toHaveBeenCalledWith("https://fb.example.com/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      body: JSON.stringify({ content: "좋아요", platform: "ios" }),
    });
  });

  it("429는 TOO_FREQUENT로 거절한다", async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({ ok: false, status: 429 } as Response);
    const { submitFeedback } = await import("../feedbackProxyApi");
    await expect(submitFeedback("a")).rejects.toMatchObject({ code: "TOO_FREQUENT" });
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("그 외 실패 상태는 UNKNOWN으로 거절한다", async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({ ok: false, status: 500 } as Response);
    const { submitFeedback } = await import("../feedbackProxyApi");
    await expect(submitFeedback("a")).rejects.toMatchObject({ code: "UNKNOWN" });
    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(mockReportError).toHaveBeenCalledWith(expect.any(Error), "feedback");
  });

  it("네트워크 예외도 UNKNOWN이다", async () => {
    global.fetch = jest.fn<typeof fetch>().mockRejectedValue(new TypeError("Network request failed"));
    const { submitFeedback } = await import("../feedbackProxyApi");
    await expect(submitFeedback("a")).rejects.toMatchObject({ code: "UNKNOWN" });
    expect(mockReportError).toHaveBeenCalledTimes(1);
  });

  it("URL 미설정이면 fetch 없이 UNKNOWN이다", async () => {
    process.env.EXPO_PUBLIC_FEEDBACK_PROXY_URL = "";
    const fetchMock = jest.fn<typeof fetch>();
    global.fetch = fetchMock;
    const { submitFeedback } = await import("../feedbackProxyApi");
    await expect(submitFeedback("a")).rejects.toMatchObject({ code: "UNKNOWN" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockReportError).toHaveBeenCalledTimes(1);
  });

  it("로그인하지 않았으면 UNKNOWN이다", async () => {
    mockAuth.currentUser = null;
    const fetchMock = jest.fn<typeof fetch>();
    global.fetch = fetchMock;
    const { submitFeedback } = await import("../feedbackProxyApi");
    await expect(submitFeedback("a")).rejects.toMatchObject({ code: "UNKNOWN" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockReportError).toHaveBeenCalledTimes(1);
  });

  it("공백뿐인 내용은 fetch 없이 UNKNOWN이다", async () => {
    const fetchMock = jest.fn<typeof fetch>();
    global.fetch = fetchMock;
    const { submitFeedback } = await import("../feedbackProxyApi");
    await expect(submitFeedback("   ")).rejects.toMatchObject({ code: "UNKNOWN" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockReportError).not.toHaveBeenCalled();
  });
});
