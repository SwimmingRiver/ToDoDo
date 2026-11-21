import { describe, it, expect } from "vitest";
import type { Todo } from "../../types/todo";
import { toDateKey } from "../../insights/date";
import {
  filterUnsyncedEvents,
  formatGoogleEventTime,
  getGoogleEventDateKeys,
  isDateInGoogleEventRange,
} from "../overlay";

const ev = (id: string, start = "2026-05-10", end = "2026-05-11") => ({ id, title: id, start, end });

describe("filterUnsyncedEvents", () => {
  it("todo에 연결된 id는 제외한다", () => {
    const todos = [{ googleEventId: "g1" }, { googleEventId: null }, {}] as Todo[];
    expect(filterUnsyncedEvents([ev("g1"), ev("g2")], todos).map((e) => e.id)).toEqual(["g2"]);
  });
});

describe("isDateInGoogleEventRange", () => {
  it("종일 이벤트는 end 배타", () => {
    const e = ev("a", "2026-05-10", "2026-05-12");
    expect(isDateInGoogleEventRange("2026-05-10", e)).toBe(true);
    expect(isDateInGoogleEventRange("2026-05-11", e)).toBe(true);
    expect(isDateInGoogleEventRange("2026-05-12", e)).toBe(false);
  });
  it("자정에 끝나는 시간 이벤트는 다음 날 포함 안 됨", () => {
    const start = new Date(2026, 4, 10, 22, 0).toISOString();
    const end = new Date(2026, 4, 11, 0, 0).toISOString();
    const e = ev("a", start, end);
    expect(isDateInGoogleEventRange("2026-05-10", e)).toBe(true);
    expect(isDateInGoogleEventRange("2026-05-11", e)).toBe(false);
  });
  it("start가 비면 false", () => {
    expect(isDateInGoogleEventRange("2026-05-10", { start: "", end: "" })).toBe(false);
  });
});

describe("formatGoogleEventTime", () => {
  it("종일", () => expect(formatGoogleEventTime("2026-05-10", "2026-05-10")).toBe("종일"));
  it("전날부터 이어짐", () => {
    const start = new Date(2026, 4, 10, 23, 30).toISOString();
    expect(formatGoogleEventTime(start, "2026-05-11")).toBe("전날부터 이어짐");
  });
  it("그날 시작이면 로컬 시각", () => {
    const start = new Date(2026, 4, 10, 15, 5).toISOString();
    expect(formatGoogleEventTime(start, toDateKey(new Date(start)))).toBe(
      new Date(start).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" }),
    );
  });
});

describe("getGoogleEventDateKeys", () => {
  it("여러 날 이벤트 키를 범위로 자른다", () => {
    const e = ev("a", "2026-05-08", "2026-05-14");
    expect(getGoogleEventDateKeys(e, "2026-05-10", "2026-05-12")).toEqual(["2026-05-10", "2026-05-11"]);
  });
  it("범위 안의 이벤트는 전체 날짜, end 배타", () => {
    expect(getGoogleEventDateKeys(ev("a", "2026-05-10", "2026-05-12"), "2026-05-01", "2026-06-01")).toEqual([
      "2026-05-10",
      "2026-05-11",
    ]);
  });
  it("범위 밖이면 빈 배열", () => {
    expect(getGoogleEventDateKeys(ev("a"), "2026-06-01", "2026-07-01")).toEqual([]);
  });
});
