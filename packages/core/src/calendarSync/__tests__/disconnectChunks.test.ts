import { describe, it, expect } from "vitest";
import { DISCONNECT_CHUNK_SIZE, disconnectInChunks } from "../disconnectChunks";
import type { DisconnectResult } from "../types";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `e${i}`);

const recorder = (fail?: (call: number) => Error | undefined) => {
  const calls: { ids: string[]; keepToken: boolean }[] = [];
  const send = async (chunk: string[], keepToken: boolean): Promise<DisconnectResult> => {
    calls.push({ ids: chunk, keepToken });
    const error = fail?.(calls.length);
    if (error) throw error;
    // 마지막 id는 삭제 실패했다고 흉내(응답에서 빠짐)
    return { deletedGoogleEventIds: chunk.filter((id) => id !== "e3") };
  };
  return { calls, send };
};

describe("disconnectInChunks", () => {
  it("묶음 크기 기본값은 10이다", () => {
    expect(DISCONNECT_CHUNK_SIZE).toBe(10);
  });

  it("10개씩 순서대로 보내고, 마지막 묶음만 keepToken 없이(토큰 삭제) 보낸다", async () => {
    const { calls, send } = recorder();
    const result = await disconnectInChunks(ids(23), send);
    expect(calls.map((c) => [c.ids.length, c.keepToken])).toEqual([
      [10, true],
      [10, true],
      [3, false],
    ]);
    expect(result.deletedGoogleEventIds).toEqual(ids(23).filter((id) => id !== "e3"));
  });

  it("id가 없으면 빈 목록으로 한 번만(토큰 삭제) 보낸다", async () => {
    const { calls, send } = recorder();
    await disconnectInChunks([], send);
    expect(calls).toEqual([{ ids: [], keepToken: false }]);
  });

  it("10개 이하면 한 번에 토큰 삭제까지 보낸다", async () => {
    const { calls, send } = recorder();
    await disconnectInChunks(ids(10), send);
    expect(calls.map((c) => c.keepToken)).toEqual([false]);
  });

  it("앞 묶음이 실패하면 멈추고 에러를 그대로 던진다(토큰은 아직 남아 재시도 가능)", async () => {
    const { calls, send } = recorder((n) => (n === 2 ? new Error("연동 해제 실패") : undefined));
    await expect(disconnectInChunks(ids(25), send)).rejects.toThrow("연동 해제 실패");
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.keepToken)).toBe(true);
  });

  it("앞 요청이 끝난 뒤에 다음 요청을 보낸다", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await disconnectInChunks(ids(30), async (chunk) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return { deletedGoogleEventIds: chunk };
    });
    expect(maxInFlight).toBe(1);
  });
});
