import { describe, it, expect, vi, afterEach } from "vitest";
import {
  syncTodosToGoogleCalendar,
  fetchGoogleWithRetry,
  createGoogleFetchBudget,
  GOOGLE_FETCH_BUDGET,
  type SyncTodoItem,
} from "../googleCalendar";
import { deriveGoogleCalendarEventId } from "../googleEventId";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

describe("syncTodosToGoogleCalendar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("googleEventId가 없으면 결정론적 id로 POST해서 새 이벤트를 생성한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-event-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-1", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");

    expect(results).toEqual([{ id: "todo-1", googleEventId: "new-event-id" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(CALENDAR_API_BASE);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      id: await deriveGoogleCalendarEventId("todo-1"),
      summary: "테스트",
      start: { date: "2026-09-01" },
      end: { date: "2026-09-02" },
      status: "confirmed",
    });
  });

  it("같은 todo id로 다시 최초 동기화해도 항상 같은 후보 id로 POST한다(결정론성)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-event-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-stable", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    await syncTodosToGoogleCalendar(todos, "access-token");
    await syncTodosToGoogleCalendar(todos, "access-token");

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(firstBody.id).toBe(secondBody.id);
    expect(firstBody.id).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it("다른 탭이 같은 후보 id로 먼저 생성해 409가 나면, 기존 이벤트를 조회해 성공으로 처리한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "won-by-other-tab", status: "confirmed" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-race", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([{ id: "todo-race", googleEventId: "won-by-other-tab" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, postInit] = fetchMock.mock.calls[0];
    expect(postInit.method).toBe("POST");
    const candidateId = JSON.parse(postInit.body).id;
    const [getUrl, getInit] = fetchMock.mock.calls[1];
    expect(getUrl).toBe(`${CALENDAR_API_BASE}/${candidateId}`);
    expect(getInit.method).toBeUndefined(); // GET (fetch 기본 메서드)
  });

  it("409 충돌 후 조회한 이벤트가 취소된(tombstone) 상태면 되살리기(PATCH)를 시도한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "candidate-id", status: "cancelled" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "candidate-id" }) });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-tombstone", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([{ id: "todo-tombstone", googleEventId: "candidate-id" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, reviveInit] = fetchMock.mock.calls[2];
    expect(reviveInit.method).toBe("PATCH");
    expect(JSON.parse(reviveInit.body).status).toBe("confirmed");
  });

  it("tombstone 되살리기가 일시적으로 실패하면 id 미지정 POST로 폴백하지 않고 에러로 남겨 재시도되게 한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "candidate-id", status: "cancelled" }) })
      // Worker 내부 백오프 재시도(최대 2회)까지 전부 429인 경우
      .mockResolvedValue({ ok: false, status: 429, text: async () => "Too Many Requests" });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-retry", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1, { sleep: async () => {} });

    // 다른 탭이 방금 되살렸을 수 있으므로 새 랜덤 id 이벤트를 만들면 중복이 된다 —
    // 에러로 남기면 호출부가 스냅샷을 갱신하지 않아 다음 실행에서 같은 id로 수렴한다.
    expect(results).toEqual([
      { id: "todo-retry", googleEventId: null, error: expect.stringContaining("429") },
    ]);
    // POST 409 + GET + 되살리기 PATCH 3회(첫 시도 + 재시도 2회). id 미지정 POST는 없다.
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.slice(2).every(([, init]) => init.method === "PATCH")).toBe(true);
  });

  it("409 충돌 후 조회가 레이트 리밋 403으로 재시도까지 실패해도 id 미지정 POST로 폴백하지 않는다", async () => {
    const rateLimited = JSON.stringify({ error: { errors: [{ domain: "usageLimits", reason: "rateLimitExceeded" }] } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockImplementation(async () => new Response(rateLimited, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const results = await syncTodosToGoogleCalendar(
      [{ id: "todo-rl", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" }],
      "access-token",
      1,
      { sleep: async () => {} },
    );

    expect(results).toEqual([
      { id: "todo-rl", googleEventId: null, error: expect.stringContaining("rateLimitExceeded") },
    ]);
    // POST 1 + GET 3(첫 시도 + 재시도 2회)
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("409 충돌 후 조회가 일시적 오류(403)면 id 미지정 POST로 폴백하지 않고 에러로 남긴다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => "rateLimitExceeded" });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-transient", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([
      { id: "todo-transient", googleEventId: null, error: expect.stringContaining("403") },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("googleEventId가 있으면 PATCH로 기존 이벤트를 수정한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "existing-event-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      {
        id: "todo-1",
        title: "제목 변경",
        dueAt: "2026-09-01",
        googleEventId: "existing-event-id",
        action: "upsert",
      },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");

    expect(results).toEqual([{ id: "todo-1", googleEventId: "existing-event-id" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${CALENDAR_API_BASE}/existing-event-id`);
    expect(init.method).toBe("PATCH");
  });

  // 삭제된 이벤트는 404가 아니라 tombstone(status: cancelled)이라 그 id로 PATCH하면
  // 200이 오면서도 cancelled 그대로 남는다 — 사용자가 구글에서 직접 지운 이벤트나
  // 연동 해제로 지워진 이벤트를 stale id로 수정하면 캘린더에 영영 안 보인다.
  // 모든 upsert PATCH에 status: confirmed를 실어 tombstone을 자동으로 되살린다.
  it("PATCH 본문에 status: confirmed를 실어 tombstone을 되살린다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "existing-event-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await syncTodosToGoogleCalendar(
      [{ id: "todo-1", title: "제목", dueAt: "2026-09-01", googleEventId: "existing-event-id", action: "upsert" }],
      "access-token",
    );

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body).status).toBe("confirmed");
  });

  it("action이 delete면 DELETE 요청을 보내고 googleEventId null을 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-1", title: "", dueAt: "", googleEventId: "event-to-delete", action: "delete" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");

    expect(results).toEqual([{ id: "todo-1", googleEventId: null }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${CALENDAR_API_BASE}/event-to-delete`);
    expect(init.method).toBe("DELETE");
  });

  it("삭제 대상 이벤트가 구글에 이미 없어도(404) 실패로 취급하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const todos: SyncTodoItem[] = [
      { id: "todo-1", title: "", dueAt: "", googleEventId: "already-gone", action: "delete" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token");
    expect(results).toEqual([{ id: "todo-1", googleEventId: null }]);
  });

  it("409 충돌 후 조회가 404면(id는 예약됐지만 이벤트 조회 불가) 그때만 id 미지정 POST로 폴백한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "Not Found" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "brand-new-id" }) });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-odd", title: "테스트", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([{ id: "todo-odd", googleEventId: "brand-new-id" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [fallbackUrl, fallbackInit] = fetchMock.mock.calls[2];
    expect(fallbackUrl).toBe(CALENDAR_API_BASE);
    expect(fallbackInit.method).toBe("POST");
    expect(JSON.parse(fallbackInit.body).id).toBeUndefined();
  });

  it("PATCH 대상 이벤트가 이미 삭제됐으면(404) 결정론적 id로 새로 생성한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "new-event-id" }) });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      {
        id: "todo-1",
        title: "제목",
        dueAt: "2026-09-01",
        googleEventId: "deleted-event-id",
        action: "upsert",
      },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([{ id: "todo-1", googleEventId: "new-event-id" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0];
    expect(firstUrl).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/deleted-event-id");
    expect(firstInit.method).toBe("PATCH");
    const [secondUrl, secondInit] = fetchMock.mock.calls[1];
    expect(secondUrl).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(secondInit.method).toBe("POST");
    expect(JSON.parse(secondInit.body).id).toBe(await deriveGoogleCalendarEventId("todo-1"));
  });

  it("PATCH 404 재생성 경로에서도 다른 탭이 먼저 만들었으면(409) 기존 이벤트로 수렴한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Conflict" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "won-by-other-tab", status: "confirmed" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      {
        id: "todo-1",
        title: "제목",
        dueAt: "2026-09-01",
        googleEventId: "deleted-event-id",
        action: "upsert",
      },
    ];

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([{ id: "todo-1", googleEventId: "won-by-other-tab" }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("동시 요청 수를 제한한다", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { ok: true, json: async () => ({ id: "event-id" }) };
      }),
    );

    const todos: SyncTodoItem[] = Array.from({ length: 25 }, (_, i) => ({
      id: `todo-${i}`,
      title: `할 일 ${i}`,
      dueAt: "2026-09-01",
      googleEventId: null,
      action: "upsert" as const,
    }));

    await syncTodosToGoogleCalendar(todos, "access-token", 5);

    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it("일부 항목이 실패해도 나머지 결과는 그대로 반환한다(전체 reject 안 함)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "event-success" }) })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Internal Server Error" });
    vi.stubGlobal("fetch", fetchMock);

    const todos: SyncTodoItem[] = [
      { id: "todo-ok", title: "성공", dueAt: "2026-09-01", googleEventId: null, action: "upsert" },
      { id: "todo-fail", title: "실패", dueAt: "2026-09-02", googleEventId: null, action: "upsert" },
    ];

    // concurrency 1로 고정해 mockResolvedValueOnce 순서와 실행 순서를 일치시킨다.
    const results = await syncTodosToGoogleCalendar(todos, "access-token", 1);

    expect(results).toEqual([
      { id: "todo-ok", googleEventId: "event-success" },
      { id: "todo-fail", googleEventId: null, error: expect.stringContaining("500") },
    ]);
  });
});

// 11-21 첫 동기화에서 30건을 동시 10개로 쏘다 구글이 403 rateLimitExceeded를 무더기로
// 돌려줬다. 레이트 리밋 응답은 잠깐 기다리면 풀리므로 Worker 안에서 백오프 재시도한다.
describe("fetchGoogleWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const rateLimitBody = (reason: string) =>
    JSON.stringify({ error: { errors: [{ domain: "usageLimits", reason }], code: 403, message: "Rate Limit Exceeded" } });

  const noSleep = () => {
    const delays: number[] = [];
    return { delays, sleep: async (ms: number) => void delays.push(ms) };
  };

  it("429면 백오프 후 재시도해 성공 응답을 돌려준다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Too Many Requests", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { delays, sleep } = noSleep();

    const res = await fetchGoogleWithRetry(CALENDAR_API_BASE, { method: "POST" }, { sleep, random: () => 0 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([500]);
  });

  it.each(["rateLimitExceeded", "userRateLimitExceeded"])("403 %s면 재시도한다", async (reason) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(rateLimitBody(reason), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sleep } = noSleep();

    const res = await fetchGoogleWithRetry(CALENDAR_API_BASE, {}, { sleep });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("지수 백오프 + 지터로 최대 2번까지만 재시도하고, 마지막 응답 본문을 그대로 읽을 수 있게 돌려준다", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response(rateLimitBody("rateLimitExceeded"), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const { delays, sleep } = noSleep();

    const res = await fetchGoogleWithRetry(CALENDAR_API_BASE, {}, { sleep, random: () => 0.5 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([750, 1250]);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("rateLimitExceeded");
  });

  it("레이트 리밋이 아닌 403(권한 등)은 재시도하지 않고 같은 상태·본문으로 돌려준다", async () => {
    const forbidden = JSON.stringify({ error: { errors: [{ domain: "global", reason: "forbidden" }], code: 403 } });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(forbidden, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const { delays, sleep } = noSleep();

    const res = await fetchGoogleWithRetry(CALENDAR_API_BASE, {}, { sleep });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
    expect(res.status).toBe(403);
    expect(res.ok).toBe(false);
    expect(await res.text()).toBe(forbidden);
  });

  it("5xx·404 등 다른 상태는 재시도하지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("err", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sleep } = noSleep();

    const res = await fetchGoogleWithRetry(CALENDAR_API_BASE, {}, { sleep });

    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("재시도 전에 버리는 429 응답 본문은 반드시 취소한다(drainBody 규칙)", async () => {
    const first = new Response("Too Many Requests", { status: 429 });
    const cancelSpy = vi.spyOn(first.body!, "cancel");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(new Response("{}", { status: 200 })),
    );
    const { sleep } = noSleep();

    await fetchGoogleWithRetry(CALENDAR_API_BASE, {}, { sleep });

    expect(cancelSpy).toHaveBeenCalled();
  });
});

describe("syncTodosToGoogleCalendar 레이트 리밋", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCH가 403 rateLimitExceeded면 재시도해서 성공시킨다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { errors: [{ domain: "usageLimits", reason: "rateLimitExceeded" }] } }), {
          status: 403,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "existing" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const results = await syncTodosToGoogleCalendar(
      [{ id: "todo-1", title: "t", dueAt: "2026-09-01", googleEventId: "existing", action: "upsert" }],
      "access-token",
      1,
      { sleep: async () => {} },
    );

    expect(results).toEqual([{ id: "todo-1", googleEventId: "existing" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("기본 동시 요청 수는 3이다(구글 레이트 리밋 회피)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { ok: true, json: async () => ({ id: "event-id" }) };
      }),
    );

    const todos: SyncTodoItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: `todo-${i}`,
      title: `할 일 ${i}`,
      dueAt: "2026-09-01",
      googleEventId: null,
      action: "upsert" as const,
    }));

    await syncTodosToGoogleCalendar(todos, "access-token");

    expect(maxInFlight).toBe(3);
  });
});

// Cloudflare 무료 플랜은 들어온 요청 하나당 서브리퀘스트 50개(JWKS·토큰 갱신 포함)가 한도다.
// 재시도까지 합쳐도 구글 호출이 예산(44)을 넘지 않게 한다.
describe("구글 호출 예산", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("예산 기본값은 44다(JWKS 2 + 토큰 갱신 1 여유를 두고 50 미만)", () => {
    expect(GOOGLE_FETCH_BUDGET).toBe(44);
    expect(createGoogleFetchBudget()).toEqual({ used: 0, limit: 44 });
  });

  it("예산이 바닥나면 레이트 리밋 응답을 재시도하지 않고 그대로 돌려준다", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("slow down", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const budget = { used: 43, limit: 44 };
    const sleep = vi.fn(async () => {});

    const res = await fetchGoogleWithRetry(CALENDAR_API_BASE, {}, { sleep, budget });

    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(budget.used).toBe(44);
  });

  it("예산이 이미 바닥났으면 호출하지 않고 에러를 던진다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchGoogleWithRetry(CALENDAR_API_BASE, {}, { budget: { used: 44, limit: 44 } }),
    ).rejects.toThrow(/예산/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("항목이 많아도 구글 호출은 예산을 넘지 않고, 시도조차 못 한 항목은 에러 결과로 돌려준다", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({ id: "e" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const todos: SyncTodoItem[] = Array.from({ length: 50 }, (_, i) => ({
      id: `todo-${i}`,
      title: "",
      dueAt: "",
      googleEventId: `event-${i}`,
      action: "delete" as const,
    }));

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 3, {
      budget: createGoogleFetchBudget(),
      sleep: async () => {},
    });

    expect(fetchMock).toHaveBeenCalledTimes(44);
    expect(results.filter((r) => !r.error)).toHaveLength(44);
    const skipped = results.filter((r) => r.error);
    expect(skipped).toHaveLength(6);
    expect(skipped[0].error).toMatch(/예산/);
    expect(skipped[0].googleEventId).toBe(skipped[0].id.replace("todo", "event"));
  });

  it("계속 레이트 리밋이 나도 재시도 포함 총 구글 호출이 예산을 넘지 않는다", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("slow down", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const todos: SyncTodoItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `todo-${i}`,
      title: "t",
      dueAt: "2026-09-01",
      googleEventId: `event-${i}`,
      action: "upsert" as const,
    }));

    const results = await syncTodosToGoogleCalendar(todos, "access-token", 3, {
      budget: createGoogleFetchBudget(),
      sleep: async () => {},
    });

    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(44);
    expect(results.every((r) => r.error)).toBe(true);
  });

  it("예산을 넘기지 않으면 syncTodosToGoogleCalendar 호출마다 새 예산을 쓴다", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({ id: "e" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const todos: SyncTodoItem[] = Array.from({ length: 30 }, (_, i) => ({
      id: `todo-${i}`,
      title: "",
      dueAt: "",
      googleEventId: `event-${i}`,
      action: "delete" as const,
    }));

    await syncTodosToGoogleCalendar(todos, "access-token");
    await syncTodosToGoogleCalendar(todos, "access-token");

    expect(fetchMock).toHaveBeenCalledTimes(60);
  });
});
