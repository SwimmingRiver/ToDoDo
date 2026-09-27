import { describe, it, expect, vi } from "vitest";
import { FirestoreClient, FirestoreError, decodeValue, toReminderTodo } from "../firestore";

const BASE = "https://firestore.googleapis.com/v1/projects/p1/databases/(default)/documents";
const fields = {
  userId: { stringValue: "u1" },
  title: { stringValue: "보고서" },
  status: { stringValue: "todo" },
  archived: { booleanValue: false },
  dueAt: { stringValue: "2026-10-01T09:00:00.000Z" },
  reminderOffsetMinutes: { integerValue: "60" },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const client = (fetchFn: ReturnType<typeof vi.fn>) =>
  new FirestoreClient("p1", async () => "tok", fetchFn as unknown as typeof fetch);

describe("decodeValue", () => {
  it("REST 값 타입을 JS 값으로 바꾼다", () => {
    expect(decodeValue({ stringValue: "a" })).toBe("a");
    expect(decodeValue({ integerValue: "30" })).toBe(30);
    expect(decodeValue({ doubleValue: 1.5 })).toBe(1.5);
    expect(decodeValue({ booleanValue: true })).toBe(true);
    expect(decodeValue({ nullValue: null })).toBeNull();
    expect(decodeValue({ mapValue: { fields: { a: { stringValue: "b" } } } })).toEqual({ a: "b" });
    expect(decodeValue({ arrayValue: { values: [{ integerValue: "1" }] } })).toEqual([1]);
    expect(decodeValue({ arrayValue: {} })).toEqual([]);
  });
});

describe("toReminderTodo", () => {
  it("필드를 ReminderTodo로 매핑하고 archived 누락은 false", () => {
    const { archived: _a, ...noArchived } = fields;
    expect(toReminderTodo("t1", noArchived)).toEqual({
      id: "t1",
      userId: "u1",
      title: "보고서",
      status: "todo",
      archived: false,
      dueAt: "2026-10-01T09:00:00.000Z",
      reminderOffsetMinutes: 60,
    });
  });

  it("reminderOffsetMinutes 문자열 off와 누락을 보존한다", () => {
    expect(toReminderTodo("t", { ...fields, reminderOffsetMinutes: { stringValue: "off" } }).reminderOffsetMinutes).toBe("off");
    const { reminderOffsetMinutes: _r, ...rest } = fields;
    expect(toReminderTodo("t", rest).reminderOffsetMinutes).toBeUndefined();
  });
});

describe("FirestoreClient", () => {
  it("queryUpcomingTodos는 userId + dueAt 범위로 runQuery한다", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      json([
        { document: { name: `projects/p1/databases/(default)/documents/todos/t1`, fields } },
        { readTime: "2026-10-01T00:00:00Z" },
      ]),
    );
    const todos = await client(fetchFn).queryUpcomingTodos("u1", "2026-10-01T00:00:00.000Z", "2026-10-09T00:00:00.000Z");

    expect(todos.map((t) => t.id)).toEqual(["t1"]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}:runQuery`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({
      structuredQuery: {
        from: [{ collectionId: "todos" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "userId" }, op: "EQUAL", value: { stringValue: "u1" } } },
              {
                fieldFilter: {
                  field: { fieldPath: "dueAt" },
                  op: "GREATER_THAN_OR_EQUAL",
                  value: { stringValue: "2026-10-01T00:00:00.000Z" },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: "dueAt" },
                  op: "LESS_THAN_OR_EQUAL",
                  value: { stringValue: "2026-10-09T00:00:00.000Z" },
                },
              },
            ],
          },
        },
      },
    });
  });

  it("getTodo는 404면 null, 다른 사용자 문서면 null", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ error: {} }, 404))
      .mockResolvedValueOnce(json({ name: "x/todos/t1", fields: { ...fields, userId: { stringValue: "other" } } }))
      .mockResolvedValueOnce(json({ name: "x/todos/t1", fields }));
    const c = client(fetchFn);
    expect(await c.getTodo("u1", "t1")).toBeNull();
    expect(await c.getTodo("u1", "t1")).toBeNull();
    expect((await c.getTodo("u1", "t1"))?.title).toBe("보고서");
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE}/todos/t1`);
  });

  it("getReminderDefault는 문서가 없으면 undefined", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json({ fields: { reminderDefaultOffsetMinutes: { stringValue: "off" } } }));
    const c = client(fetchFn);
    expect(await c.getReminderDefault("u1")).toBeUndefined();
    expect(await c.getReminderDefault("u1")).toBe("off");
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE}/userSettings/u1`);
  });

  it("404가 아닌 실패는 FirestoreError", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({}, 503));
    await expect(client(fetchFn).getTodo("u1", "t1")).rejects.toBeInstanceOf(FirestoreError);
  });
});
