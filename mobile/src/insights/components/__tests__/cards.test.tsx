import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import {
  CompletionTrendCard,
  InsightsLockedNotice,
  InsightsSkeleton,
  PriorityDistributionCard,
  StatusBreakdownCard,
  StreakCard,
  SummaryCards,
} from "..";

// 레이아웃이 없는 테스트 환경에서는 너비가 0이라 차트가 그려지지 않으므로 측정값을 고정한다.
jest.mock("../../charts/useMeasuredWidth", () => ({
  useMeasuredWidth: () => ({ width: 300, onLayout: () => undefined }),
}));

describe("StreakCard", () => {
  it("0일이면 시작 유도 문구", async () => {
    await render(<StreakCard streak={0} />);
    expect(screen.getByText("0일")).toBeTruthy();
    expect(screen.getByText("오늘부터 시작해보세요")).toBeTruthy();
    expect(screen.getByText("전체 기간 기준")).toBeTruthy();
  });

  it("3일이면 연속 완료 중", async () => {
    await render(<StreakCard streak={3} />);
    expect(screen.getByText("3일")).toBeTruthy();
    expect(screen.getByText("연속 완료 중")).toBeTruthy();
  });
});

describe("SummaryCards", () => {
  it("완료율 카드는 퍼센트와 분수를 보여준다", async () => {
    const empty = { rate: 0, completed: 0, total: 0 };
    await render(
      <SummaryCards
        periodLabel="이번 달"
        completionRate={{ rate: 0.72, completed: 18, total: 25 }}
        dueAdherence={empty}
        recurringVsOneOff={{ recurring: empty, oneOff: empty }}
      />,
    );
    expect(screen.getByText("이번 달 완료율")).toBeTruthy();
    expect(screen.getByText("72%")).toBeTruthy();
    expect(screen.getByText("18 / 25")).toBeTruthy();
    expect(screen.getByText("이번 달 기한 준수율")).toBeTruthy();
    expect(screen.getByText("이번 달 반복 할 일 완료율")).toBeTruthy();
    expect(screen.getByText("이번 달 일반 할 일 완료율")).toBeTruthy();
    expect(screen.getAllByText("0 / 0")).toHaveLength(3);
  });
});

describe("StatusBreakdownCard", () => {
  it("0건이면 안내 문구만 보이고 범례는 없다", async () => {
    await render(<StatusBreakdownCard breakdown={{ todo: 0, doing: 0, done: 0 }} />);
    expect(screen.getByText("프로젝트 상태 구성")).toBeTruthy();
    expect(screen.getByText("하위 할 일이 없습니다")).toBeTruthy();
    expect(screen.queryByText("진행 중 0")).toBeNull();
  });

  it("범례에 라벨과 건수를 병기한다", async () => {
    await render(<StatusBreakdownCard breakdown={{ todo: 1, doing: 2, done: 3 }} />);
    expect(screen.getByText("할 일 1")).toBeTruthy();
    expect(screen.getByText("진행 중 2")).toBeTruthy();
    expect(screen.getByText("완료 3")).toBeTruthy();
    expect(screen.getByLabelText("프로젝트 상태 구성, 총 6건")).toBeTruthy();
  });
});

describe("PriorityDistributionCard", () => {
  it("제목을 그대로 보여주고 접근성 라벨로 쓴다", async () => {
    await render(
      <PriorityDistributionCard title="이번 달 완료한 할 일의 우선순위 분포" distribution={{ high: 1, medium: 2, low: 3 }} />,
    );
    expect(screen.getByText("이번 달 완료한 할 일의 우선순위 분포")).toBeTruthy();
    expect(screen.getByLabelText("이번 달 완료한 할 일의 우선순위 분포")).toBeTruthy();
  });
});

describe("CompletionTrendCard", () => {
  it("버킷이 전부 0이면 빈 상태", async () => {
    await render(
      <CompletionTrendCard title="이번 주 완료 추이" buckets={[{ key: "월", label: "월", count: 0 }, { key: "화", label: "화", count: 0 }]} />,
    );
    expect(screen.getByText("이 기간에 기록이 없습니다")).toBeTruthy();
    expect(screen.getByText("할 일을 완료하면 여기에 추이가 쌓입니다")).toBeTruthy();
  });

  it("기록이 있으면 최대값을 접근성 라벨에 담는다", async () => {
    await render(
      <CompletionTrendCard title="이번 주 완료 추이" buckets={[{ key: "월", label: "월", count: 1 }, { key: "화", label: "화", count: 4 }]} />,
    );
    expect(screen.queryByText("이 기간에 기록이 없습니다")).toBeNull();
    expect(screen.getByLabelText("이번 주 완료 추이, 최대 4건")).toBeTruthy();
  });
});

describe("InsightsLockedNotice", () => {
  it("구독 버튼을 누르면 onSubscribe", async () => {
    const onSubscribe = jest.fn();
    await render(<InsightsLockedNotice onSubscribe={onSubscribe} />);
    expect(screen.getByText("완료 통계는 프리미엄 기능입니다")).toBeTruthy();
    fireEvent.press(screen.getByText("구독 알아보기"));
    expect(onSubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("InsightsSkeleton", () => {
  it("카드 모양 블록 4개", async () => {
    await render(<InsightsSkeleton />);
    expect(screen.getAllByTestId("insights-skeleton-card")).toHaveLength(4);
  });
});
