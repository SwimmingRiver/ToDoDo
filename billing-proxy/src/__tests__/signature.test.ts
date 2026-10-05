import { describe, it, expect } from "vitest";
import { verifyPaddleSignature } from "../signature";
import { signForTest } from "./helpers/signForTest";

const SECRET = "pdl_ntfset_test_secret";
const BODY = '{"event_id":"evt_1"}';
const TS = 1_791_590_400;

describe("verifyPaddleSignature", () => {
  it("올바른 서명이면 true", async () => {
    expect(await verifyPaddleSignature(BODY, await signForTest(BODY, SECRET, TS), SECRET, TS + 10)).toBe(true);
  });

  it("본문이 바뀌면 false", async () => {
    const header = await signForTest(BODY, SECRET, TS);
    expect(await verifyPaddleSignature('{"event_id":"evt_2"}', header, SECRET, TS)).toBe(false);
  });

  it("시크릿이 다르면 false", async () => {
    expect(await verifyPaddleSignature(BODY, await signForTest(BODY, "other", TS), SECRET, TS)).toBe(false);
  });

  it("5분보다 오래된 ts면 false", async () => {
    expect(await verifyPaddleSignature(BODY, await signForTest(BODY, SECRET, TS), SECRET, TS + 301)).toBe(false);
  });

  it("헤더가 없거나 형식이 틀리면 false", async () => {
    expect(await verifyPaddleSignature(BODY, null, SECRET, TS)).toBe(false);
    expect(await verifyPaddleSignature(BODY, "garbage", SECRET, TS)).toBe(false);
    expect(await verifyPaddleSignature(BODY, `ts=${TS}`, SECRET, TS)).toBe(false);
  });

  it("시크릿이 비어 있으면 false(설정 누락이 검증 통과로 이어지지 않게)", async () => {
    expect(await verifyPaddleSignature(BODY, await signForTest(BODY, "x", TS), "", TS)).toBe(false);
  });
});
