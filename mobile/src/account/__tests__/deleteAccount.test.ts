import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

const mockGetIdToken = jest.fn<() => Promise<string>>();
jest.mock("../../firebase", () => ({
  auth: { currentUser: { uid: "u1", getIdToken: () => mockGetIdToken() } },
  db: {},
}));

const mockGetDocs = jest.fn<() => Promise<{ docs: { data: () => Record<string, unknown> }[] }>>();
jest.mock("firebase/firestore", () => ({
  collection: () => "todosRef",
  where: () => "whereClause",
  query: () => "q",
  getDocs: () => mockGetDocs(),
}));

const ENV_KEYS = ["EXPO_PUBLIC_CALENDAR_PROXY_URL", "EXPO_PUBLIC_REMINDER_PROXY_URL", "EXPO_PUBLIC_BILLING_PROXY_URL"] as const;

const fetchMock = jest.fn<typeof fetch>();

describe("deleteAccount", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_CALENDAR_PROXY_URL = "https://cal.example";
    process.env.EXPO_PUBLIC_REMINDER_PROXY_URL = "https://rem.example";
    process.env.EXPO_PUBLIC_BILLING_PROXY_URL = "https://bill.example";
    mockGetIdToken.mockResolvedValue("id-token");
    mockGetDocs.mockResolvedValue({ docs: [{ data: () => ({ googleEventId: "ev_1" }) }, { data: () => ({ googleEventId: null }) }] });
    fetchMock.mockReset().mockImplementation(async () => new Response(null, { status: 204 }));
    global.fetch = fetchMock;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("캘린더 → 알림 → 결제 서버 순서로 ID 토큰을 붙여 호출한다", async () => {
    const { deleteAccount } = await import("../deleteAccount");
    await deleteAccount();

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual(["https://cal.example/disconnect", "https://rem.example/account", "https://bill.example/account/delete"]);
    const [, calendarInit] = fetchMock.mock.calls[0];
    expect(calendarInit?.method).toBe("POST");
    expect(JSON.parse(calendarInit?.body as string)).toEqual({ googleEventIds: ["ev_1"] });
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
    expect(fetchMock.mock.calls[2][1]?.method).toBe("POST");
    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer id-token");
    }
  });

  it("중간 단계가 실패하면 멈추고 던진다", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { deleteAccount } = await import("../deleteAccount");
    await expect(deleteAccount()).rejects.toThrow("reminder-proxy /account 실패 (500)");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("서버 주소가 비어 있으면 아무것도 호출하지 않고 던진다", async () => {
    delete process.env.EXPO_PUBLIC_BILLING_PROXY_URL;
    const { deleteAccount } = await import("../deleteAccount");
    await expect(deleteAccount()).rejects.toThrow("EXPO_PUBLIC_BILLING_PROXY_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
