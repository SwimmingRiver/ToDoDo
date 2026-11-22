import { fireEvent, render, screen } from "@testing-library/react-native";
import type { InsightsFilter, ProjectOption } from "@tododo/core";
import { InsightsFilterBar } from "../InsightsFilterBar";
import { describe, it, expect, jest } from "@jest/globals";

const projects: ProjectOption[] = [
  { id: "p1", title: "회고", isDone: true },
  { id: "p2", title: "기획", isDone: false },
];

const setup = async (filter: InsightsFilter) => {
  const onChange = jest.fn<(next: InsightsFilter) => void>();
  await render(<InsightsFilterBar filter={filter} projects={projects} onChange={onChange} />);
  return onChange;
};

describe("InsightsFilterBar", () => {
  it("기간 탭을 누르면 period만 바꾼다", async () => {
    const onChange = await setup({ period: "thisWeek", projectId: "p1" });
    fireEvent.press(screen.getByText("최근 90일"));
    expect(onChange).toHaveBeenCalledWith({ period: "last90Days", projectId: "p1" });
  });

  it("현재 기간 탭만 selected 상태다", async () => {
    await setup({ period: "thisWeek", projectId: null });
    const selected = screen.getAllByRole("tab").filter((t) => t.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("이번 주");
  });

  it("프로젝트 버튼은 현재 값을 보여준다", async () => {
    await setup({ period: "thisWeek", projectId: null });
    expect(screen.getByText("전체 프로젝트")).toBeTruthy();
  });

  it("완료 프로젝트가 선택되면 (완료)를 붙여 보여준다", async () => {
    await setup({ period: "thisWeek", projectId: "p1" });
    expect(screen.getByText("회고 (완료)")).toBeTruthy();
  });

  it("시트에서 고르면 projectId를 바꾼다", async () => {
    const onChange = await setup({ period: "thisWeek", projectId: null });
    fireEvent.press(screen.getByLabelText("프로젝트"));
    fireEvent.press(await screen.findByText("기획"));
    expect(onChange).toHaveBeenCalledWith({ period: "thisWeek", projectId: "p2" });
  });

  it("시트에서 전체 프로젝트를 고르면 null", async () => {
    const onChange = await setup({ period: "thisWeek", projectId: "p2" });
    fireEvent.press(screen.getByLabelText("프로젝트"));
    fireEvent.press(await screen.findByText("전체 프로젝트"));
    expect(onChange).toHaveBeenCalledWith({ period: "thisWeek", projectId: null });
  });
});
