import { render, screen } from "@testing-library/react-native";
import { describe, it, expect } from "@jest/globals";
import { PeriodBadge } from "../PeriodBadge";

describe("PeriodBadge", () => {
  // @testing-library/react-native@14의 render()는 async 함수다 — await 없이
  // 호출하면 screen이 아직 렌더 결과를 못 받은 상태라 쿼리가 실패한다.
  it("dayIndex/totalDays를 'n/총일차' 형태로 렌더링한다", async () => {
    await render(<PeriodBadge dayIndex={2} totalDays={3} />);
    expect(screen.getByText("2/3일차")).toBeTruthy();
  });
});
