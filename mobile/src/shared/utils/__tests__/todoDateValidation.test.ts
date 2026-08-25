import { describe, it, expect } from "@jest/globals";
import { getTodoDateValidationError } from "../todoDateValidation";

// client/src/features/todo/utils/__tests__/todoDateValidation.test.ts와 동일한 케이스.
// 순수 로직을 그대로 포팅했으므로 검증 시나리오도 동일하게 유지한다.
describe("getTodoDateValidationError", () => {
  it("startAt과 dueAt이 모두 없으면 유효하다", () => {
    expect(getTodoDateValidationError(null, null)).toBeNull();
  });

  it("startAt만 있고 dueAt이 없으면 유효하다", () => {
    expect(getTodoDateValidationError("2026-07-10T09:00:00.000Z", null)).toBeNull();
  });

  it("dueAt만 있고 startAt이 없으면 유효하다", () => {
    expect(getTodoDateValidationError(null, "2026-07-10T09:00:00.000Z")).toBeNull();
  });

  it("startAt과 dueAt이 정확히 같은 시각이면 유효하다", () => {
    const at = "2026-07-10T09:00:00.000Z";
    expect(getTodoDateValidationError(at, at)).toBeNull();
  });

  it("startAt이 dueAt보다 이전이면 유효하다", () => {
    expect(
      getTodoDateValidationError("2026-07-10T09:00:00.000Z", "2026-07-10T18:00:00.000Z"),
    ).toBeNull();
  });

  it("같은 날짜라도 startAt 시각이 dueAt 시각보다 늦으면 에러를 반환한다", () => {
    expect(
      getTodoDateValidationError("2026-07-10T18:00:00.000Z", "2026-07-10T09:00:00.000Z"),
    ).toBe("시작일시는 마감일시보다 늦을 수 없습니다");
  });

  it("startAt 날짜 자체가 dueAt 날짜보다 미래면 에러를 반환한다", () => {
    expect(
      getTodoDateValidationError("2026-07-11T00:00:00.000Z", "2026-07-10T23:59:00.000Z"),
    ).toBe("시작일시는 마감일시보다 늦을 수 없습니다");
  });
});
