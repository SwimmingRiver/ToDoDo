import { render, screen } from "@testing-library/react-native";
import { describe, it, expect } from "@jest/globals";
import { DailyProgress } from "../DailyProgress";

describe("DailyProgress", () => {
  // @testing-library/react-native@14의 render()는 async 함수다 — 반드시 await하고
  // it 콜백도 async여야 한다.
  it("날짜 라벨과 완료/전체 카운트를 렌더링한다", async () => {
    await render(<DailyProgress dateLabel="6월 15일, 오늘" doneCount={2} totalCount={5} />);
    expect(screen.getByText("6월 15일, 오늘")).toBeTruthy();
    expect(screen.getByText("2 / 5 완료")).toBeTruthy();
  });

  it("totalCount가 0이어도 에러 없이 렌더링한다", async () => {
    await render(<DailyProgress dateLabel="6월 15일, 오늘" doneCount={0} totalCount={0} />);
    expect(screen.getByText("0 / 0 완료")).toBeTruthy();
  });
});
