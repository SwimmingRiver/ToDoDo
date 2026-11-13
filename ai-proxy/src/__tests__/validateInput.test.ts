import { describe, it, expect } from "vitest";
import { isNotAGoal, isValidDateKey, parsePlanRequest } from "../validateInput";

describe("isValidDateKey", () => {
  it("실재하는 YYYY-MM-DD만 통과한다", () => {
    expect(isValidDateKey("2026-10-03")).toBe(true);
    expect(isValidDateKey("2026-02-30")).toBe(false);
    expect(isValidDateKey("2026-1-3")).toBe(false);
    expect(isValidDateKey("2026-10-03T00:00:00Z")).toBe(false);
    expect(isValidDateKey(20261003)).toBe(false);
  });
});

describe("parsePlanRequest", () => {
  const base = { goal: "다음 달 이사 준비", dueDate: "2026-10-31", today: "2026-09-25" };

  it("정상 입력은 goal을 trim해서 돌려준다", () => {
    expect(parsePlanRequest({ ...base, goal: "  이사 준비  " })).toEqual({
      goal: "이사 준비",
      dueDate: "2026-10-31",
      today: "2026-09-25",
    });
  });

  it("dueDate가 없거나 null이면 null로 채운다", () => {
    expect(parsePlanRequest({ goal: "a", today: "2026-09-25" })?.dueDate).toBeNull();
    expect(parsePlanRequest({ goal: "a", dueDate: null, today: "2026-09-25" })?.dueDate).toBeNull();
  });

  it("공백뿐인 goal, 200자 초과 goal은 거부한다", () => {
    expect(parsePlanRequest({ ...base, goal: "   " })).toBeNull();
    expect(parsePlanRequest({ ...base, goal: "가".repeat(201) })).toBeNull();
    expect(parsePlanRequest({ ...base, goal: "가".repeat(200) })).not.toBeNull();
  });

  it("마감일이 오늘보다 이전이면 거부한다(같은 날은 허용)", () => {
    expect(parsePlanRequest({ ...base, dueDate: "2026-09-24" })).toBeNull();
    expect(parsePlanRequest({ ...base, dueDate: "2026-09-25" })).not.toBeNull();
  });

  it("today 누락·형식 오류, 객체가 아닌 본문은 거부한다", () => {
    expect(parsePlanRequest({ goal: "a" })).toBeNull();
    expect(parsePlanRequest({ ...base, today: "09/25/2026" })).toBeNull();
    expect(parsePlanRequest(null)).toBeNull();
    expect(parsePlanRequest("goal")).toBeNull();
  });
});

describe("isNotAGoal", () => {
  it.each(["123", "🎉🎉", "!!!", "???  ...", " １２３ ", "👨‍👩‍👧", "12/25 🎄"])(
    "글자가 하나도 없는 %j는 목표가 아니다",
    (goal) => {
      expect(isNotAGoal(goal)).toBe(true);
    },
  );

  it.each(["토익 800", "운동 🏃", "勉強", "a"])("글자가 있는 %j는 통과한다", (goal) => {
    expect(isNotAGoal(goal)).toBe(false);
  });

  it.each(["ㅋㅋㅋ", "ㅎㅎ", "ㅠㅠ 123", "ㅋ", "ㅁㄴㅇㄹ!!", "\u1100\u1161"])(
    "자모만 있는 %j는 목표가 아니다",
    (goal) => {
      expect(isNotAGoal(goal)).toBe(true);
    },
  );

  it.each(["ㅋㅋ 토익 공부", "ㅎㅇ 운동", "asdf", "토익 800"])(
    "완성 글자나 다른 문자가 있는 %j는 통과한다",
    (goal) => {
      expect(isNotAGoal(goal)).toBe(false);
    },
  );
});
