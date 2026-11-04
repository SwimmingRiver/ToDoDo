import { render, screen, fireEvent } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import { toDateKeyFromISO } from "@tododo/core";
import { RecurrenceSection } from "../RecurrenceSection";

// core 루트(dist)는 todoApi가 @babel/runtime을 못 찾아 jest에서 로드 실패한다(알려진 문제).
// 전역 jest 설정은 건드리지 않고 이 테스트만 core src의 순수 모듈로 우회한다.
jest.mock(
  "@babel/runtime/helpers/interopRequireDefault",
  () => require("../../../../../node_modules/@babel/runtime/helpers/interopRequireDefault"),
  { virtual: true },
);
jest.mock(
  "@babel/runtime/helpers/slicedToArray",
  () => require("../../../../../node_modules/@babel/runtime/helpers/slicedToArray"),
  { virtual: true },
);
jest.mock(
  "@babel/runtime/helpers/toConsumableArray",
  () => require("../../../../../node_modules/@babel/runtime/helpers/toConsumableArray"),
  { virtual: true },
);
jest.mock("@tododo/core", () => ({
  ...jest.requireActual("../../../../../../packages/core/src/recurring/recurrenceForm"),
  ...jest.requireActual("../../../../../../packages/core/src/insights/date"),
}));

const START = new Date(2026, 10, 2, 9).toISOString();

describe("RecurrenceSection", () => {
  it("꺼진 상태에서 스위치를 누르면 daily로 켜진다", async () => {
    const onChange = jest.fn();
    await render(
      <RecurrenceSection disabled={false} startAt={START} dueAt={null} value={null} onChange={onChange} />,
    );
    expect(screen.getByText("이 할 일을 반복합니다")).toBeTruthy();
    await fireEvent(screen.getByRole("switch"), "valueChange", true);
    expect(onChange).toHaveBeenCalledWith({ type: "daily" });
  });

  it("켜진 상태에서 스위치를 끄면 null이다", async () => {
    const onChange = jest.fn();
    await render(
      <RecurrenceSection disabled={false} startAt={START} dueAt={null} value={{ type: "daily" }} onChange={onChange} />,
    );
    await fireEvent(screen.getByRole("switch"), "valueChange", false);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("noStartAt 비활성이면 문구가 보이고 onChange가 호출되지 않는다", async () => {
    const onChange = jest.fn();
    await render(
      <RecurrenceSection disabled disabledReason="noStartAt" startAt={null} dueAt={null} value={null} onChange={onChange} />,
    );
    expect(screen.getByText("반복 설정은 시작일시를 입력해야 사용할 수 있습니다")).toBeTruthy();
    await fireEvent(screen.getByRole("switch"), "valueChange", true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hasChildren 비활성 문구가 보인다", async () => {
    await render(
      <RecurrenceSection disabled disabledReason="hasChildren" startAt={START} dueAt={null} value={null} onChange={jest.fn()} />,
    );
    expect(screen.getByText("하위 할 일이 있는 항목은 반복을 설정할 수 없습니다")).toBeTruthy();
  });

  it("매주 + 빈 요일이면 에러가 보인다", async () => {
    await render(
      <RecurrenceSection disabled={false} startAt={START} dueAt={null} value={{ type: "weekly", weekdays: [] }} onChange={jest.fn()} />,
    );
    expect(screen.getByText("요일을 하나 이상 선택해주세요")).toBeTruthy();
  });

  it("월 요일을 누르면 정렬된 weekdays로 onChange된다", async () => {
    const onChange = jest.fn();
    await render(
      <RecurrenceSection disabled={false} startAt={START} dueAt={null} value={{ type: "weekly", weekdays: [] }} onChange={onChange} />,
    );
    await fireEvent.press(screen.getByLabelText("월요일"));
    expect(onChange).toHaveBeenCalledWith({ type: "weekly", weekdays: [1] });
  });

  it("선택된 요일을 누르면 해제되고 결과는 정렬된다", async () => {
    const onChange = jest.fn();
    await render(
      <RecurrenceSection disabled={false} startAt={START} dueAt={null} value={{ type: "weekly", weekdays: [3, 5] }} onChange={onChange} />,
    );
    await fireEvent.press(screen.getByLabelText("월요일"));
    expect(onChange).toHaveBeenLastCalledWith({ type: "weekly", weekdays: [1, 3, 5] });
    await fireEvent.press(screen.getByLabelText("수요일"));
    expect(onChange).toHaveBeenLastCalledWith({ type: "weekly", weekdays: [5] });
  });

  it("주기를 매주로 바꾸면 weekdays가 []이고 다른 주기로 바꾸면 undefined다", async () => {
    const onChange = jest.fn();
    const { rerender } = await render(
      <RecurrenceSection disabled={false} startAt={START} dueAt={null} value={{ type: "daily" }} onChange={onChange} />,
    );
    await fireEvent.press(screen.getByText("매주"));
    expect(onChange).toHaveBeenLastCalledWith({ type: "weekly", weekdays: [] });
    await rerender(
      <RecurrenceSection disabled={false} startAt={START} dueAt={null} value={{ type: "weekly", weekdays: [2] }} onChange={onChange} />,
    );
    await fireEvent.press(screen.getByText("매월"));
    expect(onChange).toHaveBeenLastCalledWith({ type: "monthly", weekdays: undefined });
  });

  it("매월이고 시작일이 30일이면 안내와 31일 보조 문구가 보인다", async () => {
    const startAt = new Date(2026, 10, 30, 7).toISOString();
    await render(
      <RecurrenceSection disabled={false} startAt={startAt} dueAt={null} value={{ type: "monthly" }} onChange={jest.fn()} />,
    );
    expect(screen.getByText("매월 30일에 반복됩니다 (시작일시 기준)")).toBeTruthy();
    expect(screen.getByText("31일이 없는 달은 해당 월 마지막 날에 생성됩니다")).toBeTruthy();
  });

  it("dueAt이 없으면 무기한 문구가 보인다", async () => {
    await render(
      <RecurrenceSection disabled={false} startAt={START} dueAt={null} value={{ type: "daily" }} onChange={jest.fn()} />,
    );
    expect(screen.getByText("마감일시가 없으면 무기한으로 반복됩니다")).toBeTruthy();
  });

  it("dueAt은 로컬 날짜 키로 표시된다", async () => {
    const dueAt = "2026-11-05T15:30:00.000Z";
    await render(
      <RecurrenceSection disabled={false} startAt={START} dueAt={dueAt} value={{ type: "daily" }} onChange={jest.fn()} />,
    );
    const d = new Date(dueAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    expect(toDateKeyFromISO(dueAt)).toBe(key);
    expect(screen.getByText(`${key}까지 반복됩니다`)).toBeTruthy();
  });

  it("마감이 시작보다 이르면 범위 에러가 보인다", async () => {
    const dueAt = new Date(2026, 10, 1, 9).toISOString();
    await render(
      <RecurrenceSection disabled={false} startAt={START} dueAt={dueAt} value={{ type: "daily" }} onChange={jest.fn()} />,
    );
    expect(screen.getByText("마감일은 시작일과 같거나 이후여야 합니다")).toBeTruthy();
  });
});
