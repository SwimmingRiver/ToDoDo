import { describe, it, expect } from "vitest";
import { CalendarNotConnectedError, CalendarRevokedError } from "../errors";
import {
  parseDisconnectResponse,
  parseEventsResponse,
  parseOAuthStartResponse,
  parseSyncResponse,
} from "../responses";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("parseSyncResponse", () => {
  it("성공 시 results를 반환한다", async () => {
    await expect(parseSyncResponse(json(200, { results: [{ id: "a", googleEventId: "g" }] }))).resolves.toEqual([
      { id: "a", googleEventId: "g" },
    ]);
  });
  it("401 revoked → CalendarRevokedError", async () => {
    await expect(parseSyncResponse(json(401, { error: "revoked" }))).rejects.toBeInstanceOf(CalendarRevokedError);
  });
  it("일반 401 → 동기화 실패: 401", async () => {
    await expect(parseSyncResponse(json(401, {}))).rejects.toThrow("동기화 실패: 401");
  });
  it("409 not_connected → CalendarNotConnectedError", async () => {
    await expect(parseSyncResponse(json(409, { error: "not_connected" }))).rejects.toBeInstanceOf(
      CalendarNotConnectedError,
    );
  });
  it("그 외 409 → 일반 Error", async () => {
    await expect(parseSyncResponse(json(409, { error: "x" }))).rejects.toThrow("동기화 실패: 409");
  });
  it("500 → Error", async () => {
    await expect(parseSyncResponse(json(500, {}))).rejects.toThrow("동기화 실패: 500");
  });
});

describe("parseEventsResponse", () => {
  it("events를 반환한다", async () => {
    await expect(parseEventsResponse(json(200, { events: [] }))).resolves.toEqual([]);
  });
  it("401 revoked → CalendarRevokedError, 일반 401은 Error", async () => {
    await expect(parseEventsResponse(json(401, { error: "revoked" }))).rejects.toBeInstanceOf(CalendarRevokedError);
    await expect(parseEventsResponse(json(401, {}))).rejects.toThrow("이벤트 조회 실패: 401");
  });
  it("500 → 이벤트 조회 실패", async () => {
    await expect(parseEventsResponse(json(500, {}))).rejects.toThrow("이벤트 조회 실패");
  });
});

describe("parseDisconnectResponse", () => {
  it("본문이 없으면 빈 배열", async () => {
    await expect(parseDisconnectResponse(new Response("", { status: 200 }))).resolves.toEqual({
      deletedGoogleEventIds: [],
    });
  });
  it("삭제 id를 반환한다", async () => {
    await expect(parseDisconnectResponse(json(200, { deletedGoogleEventIds: ["a"] }))).resolves.toEqual({
      deletedGoogleEventIds: ["a"],
    });
  });
  it("non-ok → 연동 해제 실패", async () => {
    await expect(parseDisconnectResponse(json(500, {}))).rejects.toThrow("연동 해제 실패");
  });
});

describe("parseOAuthStartResponse", () => {
  it("authUrl을 반환, 실패 시 OAuth 시작 실패", async () => {
    await expect(parseOAuthStartResponse(json(200, { authUrl: "https://x" }))).resolves.toBe("https://x");
    await expect(parseOAuthStartResponse(json(500, {}))).rejects.toThrow("OAuth 시작 실패");
  });
});
