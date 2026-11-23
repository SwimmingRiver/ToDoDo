import { describe, it, expect } from "vitest";
import { resolveDoneAt } from "../doneAt";

const NOW = "2026-11-23T10:00:00.000Z";
const EARLIER = "2026-11-01T09:00:00.000Z";

describe("resolveDoneAt — 상태 전환에 따른 완료 시각", () => {
  it("완료가 아닌 상태로 바뀌면 null (완료 취소 시 옛 시각을 남기지 않는다)", () => {
    expect(resolveDoneAt({ status: "done", doneAt: EARLIER }, "todo", NOW)).toBeNull();
    expect(resolveDoneAt({ status: "done", doneAt: EARLIER }, "doing", NOW)).toBeNull();
    expect(resolveDoneAt({ status: "todo", doneAt: null }, "doing", NOW)).toBeNull();
  });

  it("새로 완료되면 지금 시각", () => {
    expect(resolveDoneAt({ status: "todo", doneAt: null }, "done", NOW)).toBe(NOW);
    expect(resolveDoneAt({ status: "doing", doneAt: null }, "done", NOW)).toBe(NOW);
  });

  it("완료가 아니던 문서에 남아 있던 옛 doneAt은 무시하고 지금 시각으로 찍는다", () => {
    expect(resolveDoneAt({ status: "todo", doneAt: EARLIER }, "done", NOW)).toBe(NOW);
  });

  it("이미 완료였으면 처음 완료 시각을 유지한다 (제목만 고쳐도 완료일이 바뀌지 않게)", () => {
    expect(resolveDoneAt({ status: "done", doneAt: EARLIER }, "done", NOW)).toBe(EARLIER);
  });

  it("이미 완료인데 doneAt이 없는 옛 문서는 지금 시각으로 지어내지 않고 null로 둔다 (백필 대상)", () => {
    expect(resolveDoneAt({ status: "done", doneAt: null }, "done", NOW)).toBeNull();
    expect(resolveDoneAt({ status: "done" }, "done", NOW)).toBeNull();
  });

  it("이전 상태를 모르면(문서 없음) 새로 완료된 것으로 본다", () => {
    expect(resolveDoneAt(undefined, "done", NOW)).toBe(NOW);
    expect(resolveDoneAt(undefined, "todo", NOW)).toBeNull();
  });
});
