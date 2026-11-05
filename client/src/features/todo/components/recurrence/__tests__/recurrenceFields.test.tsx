import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RecurrenceFields from "../recurrenceFields";
import type { RecurrenceFormValue } from "../recurrenceFields.types";

const DAILY: RecurrenceFormValue = { type: "daily", endType: "indefinite", endDate: null };

describe("RecurrenceFields", () => {
  it("시작일시가 없으면 반복 체크박스가 비활성화되고 안내 문구를 보여준다", () => {
    render(
      <RecurrenceFields
        disabled
        disabledReason="noStartAt"
        startAt={null}
        dueAt={null}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(
      screen.getByText("반복 설정은 시작일시를 입력해야 사용할 수 있습니다"),
    ).toBeInTheDocument();
  });

  it("종료가 없음이면 '계속 반복됩니다' 요약을 보여준다", () => {
    render(
      <RecurrenceFields
        disabled={false}
        startAt="2026-07-07T09:00"
        dueAt={null}
        value={DAILY}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/계속 반복됩니다/)).toBeInTheDocument();
  });

  it("마감일시가 있어도 종료일로 유도하지 않는다 — 종료는 폼 값에서만 온다", () => {
    render(
      <RecurrenceFields
        disabled={false}
        startAt="2026-07-07T09:00"
        dueAt="2026-07-10T18:00"
        value={DAILY}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/계속 반복됩니다/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-07-10까지 반복됩니다/)).not.toBeInTheDocument();
  });

  it("값에 종료일이 있으면 그 날짜까지 반복된다는 요약을 보여준다", () => {
    render(
      <RecurrenceFields
        disabled={false}
        startAt="2026-07-07T09:00"
        dueAt={null}
        value={{ type: "daily", endType: "untilDate", endDate: "2026-12-31" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("2026-12-31까지 반복됩니다")).toBeInTheDocument();
  });

  it("종료일이 시작일보다 이전이면 에러 문구를 보여준다", () => {
    render(
      <RecurrenceFields
        disabled={false}
        startAt="2026-07-10T09:00"
        dueAt={null}
        value={{ type: "daily", endType: "untilDate", endDate: "2026-07-07" }}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText("종료일은 시작일과 같거나 이후여야 합니다"),
    ).toBeInTheDocument();
  });

  it("마감일이 시작일보다 이전이어도 반복 범위 에러는 없다", () => {
    render(
      <RecurrenceFields
        disabled={false}
        startAt="2026-07-10T09:00"
        dueAt="2026-07-05T09:00"
        value={DAILY}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("마감일은 시작일과 같거나 이후여야 합니다")).not.toBeInTheDocument();
  });

  it("매월 반복일 때 '일(day)'은 마감일이 아니라 시작일 기준으로 안내한다", () => {
    const value: RecurrenceFormValue = { type: "monthly", endType: "indefinite", endDate: null };
    render(
      <RecurrenceFields
        disabled={false}
        startAt="2026-07-15T09:00"
        dueAt={null}
        value={value}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("매월 15일에 반복됩니다 (시작일시 기준)")).toBeInTheDocument();
  });
});
