import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { setupUser } from "@/test/setupUser";
import NotificationHistoryList from "../notificationHistoryList";

const NOW = 1_000_000_000_000;
const MIN = 60_000;
const items = [
  { todoId: "t2", title: "기획서 제출", offsetMinutes: 30 as const, dueAt: "x", sentAt: NOW - 12 * MIN },
  { todoId: "t1", title: "운동", offsetMinutes: 1440 as const, dueAt: "x", sentAt: NOW - 3 * 24 * 60 * MIN },
];

const renderList = (props: Partial<Parameters<typeof NotificationHistoryList>[0]> = {}) => {
  const onSelect = vi.fn();
  render(
    <NotificationHistoryList
      items={items}
      isPending={false}
      isError={false}
      unreadAfter={NOW - 60 * MIN}
      now={NOW}
      onSelect={onSelect}
      {...props}
    />,
  );
  return onSelect;
};

describe("NotificationHistoryList", () => {
  it("제목, OS 알림과 같은 문구, 상대 시각을 최신순으로 보여준다", () => {
    renderList();
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("기획서 제출");
    expect(buttons[0]).toHaveTextContent("30분 후 마감이에요 · 12분 전");
    expect(buttons[1]).toHaveTextContent("내일 이 시간에 마감이에요 · 3일 전");
  });

  it("unreadAfter 이후 항목만 읽지 않음으로 표시한다", () => {
    renderList();
    const [newer, older] = screen.getAllByRole("button");
    expect(newer).toHaveAccessibleName(/읽지 않음/);
    expect(older).not.toHaveAccessibleName(/읽지 않음/);
  });

  it("항목을 누르면 그 할 일 id로 onSelect", async () => {
    const user = setupUser();
    const onSelect = renderList();
    await user.click(screen.getByRole("button", { name: /운동/ }));
    expect(onSelect).toHaveBeenCalledWith("t1");
  });

  it("비어 있으면 빈 상태 문구", () => {
    renderList({ items: [] });
    expect(screen.getByText("최근 7일간 받은 알림이 없어요")).toBeInTheDocument();
  });

  it("실패하면 실패 문구", () => {
    renderList({ items: undefined, isError: true });
    expect(screen.getByText("알림 기록을 불러오지 못했어요")).toBeInTheDocument();
  });

  it("불러오는 중엔 빈 상태 문구를 보여주지 않는다", () => {
    renderList({ items: undefined, isPending: true });
    expect(screen.queryByText("최근 7일간 받은 알림이 없어요")).not.toBeInTheDocument();
    expect(screen.getByText("불러오는 중…")).toBeInTheDocument();
  });
});
