import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RecurrenceFields from "../recurrenceFields";
import type { RecurrenceFormValue } from "../recurrenceFields.types";
import {
  END_DATE_REQUIRED_ERROR,
  END_DATE_BEFORE_START_ERROR,
} from "../recurrenceValidation";

const DAILY: RecurrenceFormValue = { type: "daily", endType: "indefinite", endDate: null };

describe("RecurrenceFields", () => {
  it("시작일시가 없으면 반복 체크박스가 비활성화되고 안내 문구를 보여준다", () => {
    render(
      <RecurrenceFields
        disabled
        disabledReason="noStartAt"
        startAt={null}
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
        value={DAILY}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/계속 반복됩니다/)).toBeInTheDocument();
  });

  it("값에 종료일이 있으면 그 날짜까지 반복된다는 요약을 보여준다", () => {
    render(
      <RecurrenceFields
        disabled={false}
        startAt="2026-07-07T09:00"
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
        value={{ type: "daily", endType: "untilDate", endDate: "2026-07-07" }}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText("종료일은 시작일과 같거나 이후여야 합니다"),
    ).toBeInTheDocument();
  });

  it("매월 반복일 때 '일(day)'은 마감일이 아니라 시작일 기준으로 안내한다", () => {
    const value: RecurrenceFormValue = { type: "monthly", endType: "indefinite", endDate: null };
    render(
      <RecurrenceFields
        disabled={false}
        startAt="2026-07-15T09:00"
        value={value}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("매월 15일에 반복됩니다 (시작일시 기준)")).toBeInTheDocument();
  });
});

describe("RecurrenceFields 반복 종료 컨트롤", () => {
  const renderWith = (value: RecurrenceFormValue, onChange = vi.fn(), startAt = "2026-07-07T09:00") => {
    render(<RecurrenceFields disabled={false} startAt={startAt} value={value} onChange={onChange} />);
    return onChange;
  };

  it("켜면 '반복 종료' 라벨과 없음(선택됨)/날짜 지정 옵션, '계속 반복됩니다' 안내가 보인다", () => {
    renderWith(DAILY);
    expect(screen.getByText("반복 종료")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "없음" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "날짜 지정" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("계속 반복됩니다")).toBeInTheDocument();
    expect(screen.queryByLabelText("반복 종료일")).not.toBeInTheDocument();
  });

  it("'날짜 지정'을 누르면 untilDate + 빈 날짜로 onChange가 불린다", () => {
    const onChange = renderWith(DAILY);
    fireEvent.click(screen.getByRole("tab", { name: "날짜 지정" }));
    expect(onChange).toHaveBeenCalledWith({ type: "daily", endType: "untilDate", endDate: null });
  });

  it("untilDate면 날짜 입력이 보이고 바꾸면 onChange(endDate)가 불린다", () => {
    const onChange = renderWith({ type: "daily", endType: "untilDate", endDate: null });
    const input = screen.getByLabelText("반복 종료일") as HTMLInputElement;
    expect(input.type).toBe("date");
    fireEvent.change(input, { target: { value: "2026-12-31" } });
    expect(onChange).toHaveBeenCalledWith({
      type: "daily",
      endType: "untilDate",
      endDate: "2026-12-31",
    });
  });

  it("untilDate + 빈 날짜면 '종료일을 선택해주세요'가 alert로 보인다", () => {
    renderWith({ type: "daily", endType: "untilDate", endDate: null });
    expect(screen.getByRole("alert")).toHaveTextContent(END_DATE_REQUIRED_ERROR);
    expect(END_DATE_REQUIRED_ERROR).toBe("종료일을 선택해주세요");
  });

  it("untilDate + 빈 날짜면 '계속 반복됩니다' 안내 없이 오류만 보인다", () => {
    renderWith({ type: "daily", endType: "untilDate", endDate: null });
    expect(screen.queryByText("계속 반복됩니다")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(END_DATE_REQUIRED_ERROR);
  });

  it("종료일 입력의 min은 시작일시의 로컬 날짜다", () => {
    // 로컬 생성자로 만든 UTC Z 문자열 — 어느 TZ에서든 로컬 날짜는 7/10이다.
    const startAt = new Date(2026, 6, 10, 0, 30).toISOString();
    renderWith({ type: "daily", endType: "untilDate", endDate: null }, vi.fn(), startAt);
    expect(screen.getByLabelText("반복 종료일")).toHaveAttribute("min", "2026-07-10");
  });

  it("다시 '없음'을 누르면 indefinite + null로 돌아간다", () => {
    const onChange = renderWith({ type: "daily", endType: "untilDate", endDate: "2026-12-31" });
    fireEvent.click(screen.getByRole("tab", { name: "없음" }));
    expect(onChange).toHaveBeenCalledWith({ type: "daily", endType: "indefinite", endDate: null });
  });

  it("마감일과 무관하게 종료 조건이 없음이면 종료 관련 에러가 없다", () => {
    renderWith(DAILY, vi.fn(), "2026-07-10T09:00");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(END_DATE_REQUIRED_ERROR)).not.toBeInTheDocument();
    expect(screen.queryByText(END_DATE_BEFORE_START_ERROR)).not.toBeInTheDocument();
  });
});
