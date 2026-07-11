import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDropDates } from "../calendarUtils";

// 캘린더 드래그 저장 회귀 테스트.
// dueAt/startAt은 UTC Z 문자열로 저장하는 것이 규칙(todoForm이 toISOString 사용)인데,
// 드래그 핸들러가 "YYYY-MM-DDT00:00" naive 문자열을 저장해 DB에 두 포맷이 혼재되던
// 버그를 막는다.
//
// 입력 형식 주의: FC의 event.start/end는 timeZone:'local'(이 앱의 기본값)에서
// dateEnv.toDate()를 거쳐 "해당 달력 날짜의 로컬 자정" Date로 방출된다.
// (moreLinkClick의 info.date 같은 raw 마커와 달리 UTC 필드가 아니라 로컬 필드에
// 달력 날짜가 담긴다. UTC 게터로 읽으면 UTC+9에서 하루 이르게 저장되는 회귀 발생.)
// CI는 UTC라서 TZ를 비-UTC로 고정해야 실제로 검증된다.

/** FC event.start/end 형식: 해당 달력 날짜의 로컬 자정 Date */
const fcEventDate = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("getDropDates (Asia/Seoul, UTC+9)", () => {
  let originalTz: string | undefined;

  beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = "Asia/Seoul";
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("dueAt을 naive 문자열이 아닌 UTC Z ISO 문자열로 반환한다", () => {
    const { newDueAt } = getDropDates(fcEventDate(2026, 7, 15), null, null);

    expect(newDueAt).not.toBeNull();
    expect(newDueAt).toMatch(/Z$/);
    expect(newDueAt).toBe(new Date(newDueAt!).toISOString());
  });

  it("단일일 이벤트: 드롭한 달력 날짜가 그대로 보존된다", () => {
    const { newDueAt } = getDropDates(fcEventDate(2026, 7, 15), null, null);

    // KST 2026-07-15 00:00 = UTC 2026-07-14 15:00
    expect(newDueAt).toBe("2026-07-14T15:00:00.000Z");
  });

  it("기간 이벤트: 배타적 end에서 하루를 빼 dueAt을 계산한다", () => {
    const { newDueAt } = getDropDates(
      fcEventDate(2026, 7, 13),
      fcEventDate(2026, 7, 16), // 배타적 end → 실제 마감일은 07-15
      "2026-07-11T15:00:00.000Z",
    );

    expect(newDueAt).toBe("2026-07-14T15:00:00.000Z");
  });

  it("기존 startAt이 있으면 start로 startAt도 함께 갱신한다", () => {
    const { newStartAt } = getDropDates(
      fcEventDate(2026, 7, 13),
      fcEventDate(2026, 7, 16),
      "2026-07-11T15:00:00.000Z",
    );

    // KST 2026-07-13 00:00 = UTC 2026-07-12 15:00
    expect(newStartAt).toBe("2026-07-12T15:00:00.000Z");
  });

  it("기존 startAt이 없으면 startAt은 건드리지 않는다(undefined)", () => {
    const { newStartAt } = getDropDates(fcEventDate(2026, 7, 15), null, null);

    expect(newStartAt).toBeUndefined();
  });

  it("start/end가 모두 없으면 dueAt은 null이다", () => {
    const { newDueAt, newStartAt } = getDropDates(null, null, null);

    expect(newDueAt).toBeNull();
    expect(newStartAt).toBeUndefined();
  });

  it("월말 경계: 8/1 → 7/31로 드래그해도 월이 어긋나지 않는다", () => {
    const { newDueAt } = getDropDates(fcEventDate(2026, 7, 31), null, null);

    // KST 2026-07-31 00:00 = UTC 2026-07-30 15:00
    expect(newDueAt).toBe("2026-07-30T15:00:00.000Z");
  });
});

describe("getDropDates (America/New_York, UTC-5/-4)", () => {
  let originalTz: string | undefined;

  beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = "America/New_York";
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("음수 오프셋에서도 드롭한 달력 날짜가 보존된다", () => {
    const { newDueAt } = getDropDates(fcEventDate(2026, 7, 15), null, null);

    // EDT 2026-07-15 00:00 = UTC 2026-07-15 04:00
    expect(newDueAt).toBe("2026-07-15T04:00:00.000Z");
  });
});
