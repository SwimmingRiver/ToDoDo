import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { useEffect } from "react";

const mockOpenTodoDetail = jest.fn();
jest.mock("../../navigation/navigationRef", () => ({
  openTodoDetail: (id: string) => mockOpenTodoDetail(id),
}));

import { ReminderBannerProvider, useReminderBanner } from "../components/ReminderBanner";

const Trigger = ({ todoId }: { todoId?: string }) => {
  const { show } = useReminderBanner();
  useEffect(() => {
    show("제목", "내용", todoId);
  }, [show, todoId]);
  return null;
};

describe("ReminderBanner", () => {
  beforeEach(() => {
    mockOpenTodoDetail.mockClear();
  });

  it("tapping the banner dismisses it and opens the todo detail", async () => {
    await render(
      <ReminderBannerProvider>
        <Trigger todoId="t1" />
      </ReminderBannerProvider>,
    );
    const banner = screen.getByRole("alert");
    await act(async () => {
      fireEvent.press(banner);
    });
    expect(mockOpenTodoDetail).toHaveBeenCalledWith("t1");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tapping a banner without todoId only dismisses", async () => {
    await render(
      <ReminderBannerProvider>
        <Trigger />
      </ReminderBannerProvider>,
    );
    await act(async () => {
      fireEvent.press(screen.getByRole("alert"));
    });
    expect(mockOpenTodoDetail).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
