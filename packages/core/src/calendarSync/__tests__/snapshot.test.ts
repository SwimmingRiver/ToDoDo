import { describe, it, expect } from "vitest";
import {
  deserializeSnapshot,
  findOrphanGoogleEventIds,
  serializeSnapshot,
  snapshotStorageKey,
} from "../snapshot";
import type { SyncSnapshot } from "../types";

describe("snapshot 직렬화", () => {
  it("왕복해도 같다", () => {
    const s: SyncSnapshot = new Map([
      ["a", { updatedAt: "u1", googleEventId: "g1" }],
      ["b", { updatedAt: "u2", googleEventId: null }],
    ]);
    expect(deserializeSnapshot(serializeSnapshot(s))).toEqual(s);
  });
  it("null·손상 값·배열 아님 → 빈 Map", () => {
    expect(deserializeSnapshot(null).size).toBe(0);
    expect(deserializeSnapshot("not json").size).toBe(0);
    expect(deserializeSnapshot('{"a":1}').size).toBe(0);
  });
  it("저장 키 형식", () => {
    expect(snapshotStorageKey("u1")).toBe("calendarSyncSnapshot:u1");
  });
});

describe("findOrphanGoogleEventIds", () => {
  it("추적되지 않는 id만 반환한다", () => {
    const s: SyncSnapshot = new Map([
      ["a", { updatedAt: "u", googleEventId: "g1" }],
      ["b", { updatedAt: "u", googleEventId: "g2" }],
      ["c", { updatedAt: "u", googleEventId: null }],
    ]);
    expect(findOrphanGoogleEventIds(s, ["g1"])).toEqual(["g2"]);
  });
});
