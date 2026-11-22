import { fireEvent, render, screen, act } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { ReactElement } from "react";
import { computeInsightsMetrics, DEFAULT_INSIGHTS_FILTER } from "@tododo/core";

let mockIsPremium = true;
let mockIsEntitlementLoading = false;
jest.mock("../../premium", () => ({
  useIsPremium: () => ({ isPremium: mockIsPremium, isLoading: mockIsEntitlementLoading }),
}));

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
}));

const mockRefetch = jest.fn<() => Promise<unknown>>();
let mockOverrides: object = {};
let mockProjects: { id: string; title: string; isDone: boolean }[] = [];
jest.mock("../../insights", () => {
  const core = require("@tododo/core");
  return {
    useInsightsMetrics: (filter: unknown) => ({
      ...core.computeInsightsMetrics([], filter, new Date()),
      projects: mockProjects,
      isLoading: false,
      hasData: true,
      isError: false,
      refetch: mockRefetch,
      isRefetching: false,
      ...mockOverrides,
    }),
  };
});

import { InsightsScreen } from "../InsightsScreen";

describe("InsightsScreen", () => {
  beforeEach(() => {
    mockIsPremium = true;
    mockIsEntitlementLoading = false;
    mockOverrides = {};
    mockProjects = [];
    mockNavigate.mockClear();
    mockRefetch.mockReset();
    mockRefetch.mockResolvedValue(undefined);
  });

  it("무료면 잠금 안내, 구독 알아보기 → Account", async () => {
    mockIsPremium = false;
    await render(<InsightsScreen />);
    expect(screen.getByText("완료 통계는 프리미엄 기능입니다")).toBeTruthy();
    await fireEvent.press(screen.getByText("구독 알아보기"));
    expect(mockNavigate).toHaveBeenCalledWith("Account");
  });

  it("로딩 중 스켈레톤", async () => {
    mockOverrides = { isLoading: true, hasData: false };
    await render(<InsightsScreen />);
    expect(screen.getByTestId("insights-skeleton")).toBeTruthy();
  });

  it("권한 로딩 중에도 스켈레톤", async () => {
    mockIsEntitlementLoading = true;
    await render(<InsightsScreen />);
    expect(screen.getByTestId("insights-skeleton")).toBeTruthy();
  });

  it("데이터 없이 에러면 에러 문구", async () => {
    mockOverrides = { isError: true, hasData: false };
    await render(<InsightsScreen />);
    expect(screen.getByText("통계를 불러오지 못했습니다")).toBeTruthy();
    expect(screen.getByText("네트워크 연결을 확인하고 다시 시도해주세요")).toBeTruthy();
  });

  it("새로고침 실패 시 기존 데이터 유지", async () => {
    mockOverrides = { isError: true, hasData: true };
    await render(<InsightsScreen />);
    expect(screen.queryByText("통계를 불러오지 못했습니다")).toBeNull();
    expect(screen.getByText("이번 달 완료율")).toBeTruthy();
  });

  it("새로고침 실패해도 refreshing 해제", async () => {
    mockRefetch.mockRejectedValue(new Error("fail"));
    await render(<InsightsScreen />);
    const control = () => screen.getByTestId("insights-scroll").props.refreshControl as ReactElement<{ refreshing: boolean; onRefresh: () => Promise<void> }>;
    expect(control().props.refreshing).toBe(false);
    await act(async () => {
      await control().props.onRefresh();
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(control().props.refreshing).toBe(false);
  });

  it("할 일 0건", async () => {
    mockOverrides = computeInsightsMetrics([], DEFAULT_INSIGHTS_FILTER, new Date());
    await render(<InsightsScreen />);
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 / 0").length).toBeGreaterThan(0);
    expect(screen.getByText("이 기간에 기록이 없습니다")).toBeTruthy();
  });

  it("선택 프로젝트가 사라지면 전체로", async () => {
    mockProjects = [{ id: "p1", title: "프로젝트A", isDone: false }];
    const view = await render(<InsightsScreen />);
    await fireEvent.press(screen.getByLabelText("프로젝트"));
    await fireEvent.press(screen.getByText("프로젝트A", { exact: true }));
    expect(screen.getAllByText("프로젝트A").length).toBeGreaterThan(0);
    mockProjects = [];
    await view.rerender(<InsightsScreen />);
    expect(screen.getByText("전체 프로젝트")).toBeTruthy();
    expect(screen.queryByText("프로젝트A")).toBeNull();
  });
});
