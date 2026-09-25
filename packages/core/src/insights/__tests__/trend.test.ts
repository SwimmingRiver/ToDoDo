import { describe, it, expect } from "vitest";
import type { Todo } from "../../types/todo";
import { bucketCompletions, resolveTrendGranularity } from "../trend";
import { PERIOD_PRESETS, PERIOD_TAB_LABELS, PERIOD_TITLE_LABELS } from "../labels";
import { resolvePeriodRange } from "../filter";

const doneOn = (id: string, key: string): Todo => ({
  id,
  userId: "u1",
  title: "할 일",
  status: "done",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: `${key}T12:00:00.000Z`,
  parentId: null,
  order: 0,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
});

// 2026-09-16 수요일
const now = new Date(2026, 8, 16, 15);

describe("resolveTrendGranularity", () => {
  it("주/월은 day, 90일은 week, 전체는 month", () => {
    expect(resolveTrendGranularity("thisWeek")).toBe("day");
    expect(resolveTrendGranularity("thisMonth")).toBe("day");
    expect(resolveTrendGranularity("last90Days")).toBe("week");
    expect(resolveTrendGranularity("all")).toBe("month");
  });
});

describe("bucketCompletions — day", () => {
  it("범위의 날마다 버킷을 만들고 빈 날은 0으로 채운다", () => {
    const range = resolvePeriodRange("thisWeek", now); // 09-13 ~ 09-16
    const todos = [doneOn("1", "2026-09-13"), doneOn("2", "2026-09-16"), doneOn("3", "2026-09-16")];

    expect(bucketCompletions(todos, range, "day", now)).toEqual([
      { key: "2026-09-13", label: "9/13", count: 1 },
      { key: "2026-09-14", label: "9/14", count: 0 },
      { key: "2026-09-15", label: "9/15", count: 0 },
      { key: "2026-09-16", label: "9/16", count: 2 },
    ]);
  });

  it("범위 밖 완료와 미완료는 세지 않는다", () => {
    const range = resolvePeriodRange("thisWeek", now);
    const notDone: Todo = { ...doneOn("x", "2026-09-14"), status: "todo" };
    const todos = [doneOn("1", "2026-09-12"), notDone];

    expect(bucketCompletions(todos, range, "day", now).every((b) => b.count === 0)).toBe(true);
  });
});

describe("bucketCompletions — week", () => {
  it("범위 시작일부터 7일 단위로 잘라 90일이면 13개, 라벨은 버킷 시작일", () => {
    const range = resolvePeriodRange("last90Days", now); // 06-19 ~ 09-16
    const todos = [doneOn("1", "2026-06-19"), doneOn("2", "2026-06-25"), doneOn("3", "2026-09-16")];

    const buckets = bucketCompletions(todos, range, "week", now);

    expect(buckets).toHaveLength(13);
    expect(buckets[0]).toEqual({ key: "2026-06-19", label: "6/19", count: 2 });
    expect(buckets[1]).toEqual({ key: "2026-06-26", label: "6/26", count: 0 });
    expect(buckets[12]).toEqual({ key: "2026-09-11", label: "9/11", count: 1 });
  });
});

describe("bucketCompletions — month", () => {
  it("range가 null이면 첫 완료월부터 이번 달까지 월별로 센다", () => {
    const todos = [doneOn("1", "2026-07-03"), doneOn("2", "2026-09-01"), doneOn("3", "2026-09-10")];

    expect(bucketCompletions(todos, null, "month", now)).toEqual([
      { key: "2026-07", label: "2026.7", count: 1 },
      { key: "2026-08", label: "2026.8", count: 0 },
      { key: "2026-09", label: "2026.9", count: 2 },
    ]);
  });

  it("range가 null이고 완료가 0건이면 빈 배열", () => {
    expect(bucketCompletions([], null, "month", now)).toEqual([]);
  });

  it("연 경계를 넘는다", () => {
    const decNow = new Date(2027, 0, 5);
    const todos = [doneOn("1", "2026-12-20")];

    expect(bucketCompletions(todos, null, "month", decNow).map((b) => b.key)).toEqual(["2026-12", "2027-01"]);
  });
});

describe("labels", () => {
  it("프리셋 순서와 라벨", () => {
    expect(PERIOD_PRESETS).toEqual(["thisWeek", "thisMonth", "last90Days", "all"]);
    expect(PERIOD_TAB_LABELS.all).toBe("전체");
    expect(PERIOD_TITLE_LABELS.all).toBe("전체 기간");
    expect(PERIOD_TITLE_LABELS.thisMonth).toBe("이번 달");
  });
});
