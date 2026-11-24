import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";

let mockHistory: { items: { sentAt: number }[]; lastSeenAt: number } | undefined;
jest.mock("../../reminders", () => ({
  useReminderHistory: () => ({ data: mockHistory }),
  hasUnreadReminders: (h?: { items: { sentAt: number }[]; lastSeenAt: number }) =>
    !!h && h.items.some((i) => i.sentAt > h.lastSeenAt),
}));
jest.mock("lucide-react-native", () => ({ Bell: () => null, UserRound: () => null }));

import { HeaderActions } from "../HeaderActions";

describe("HeaderActions", () => {
  it("bell shows badge when unread", async () => {
    mockHistory = { items: [{ sentAt: 2 }], lastSeenAt: 1 };
    await render(<HeaderActions navigate={jest.fn()} />);
    expect(screen.getByTestId("bell-unread-badge")).toBeTruthy();
    expect(screen.getByLabelText("알림, 읽지 않은 알림 있음")).toBeTruthy();
  });

  it("bell has no badge when all seen", async () => {
    mockHistory = { items: [{ sentAt: 1 }], lastSeenAt: 1 };
    await render(<HeaderActions navigate={jest.fn()} />);
    expect(screen.queryByTestId("bell-unread-badge")).toBeNull();
  });

  it("navigates to Notifications and Account", async () => {
    mockHistory = undefined;
    const navigate = jest.fn();
    await render(<HeaderActions navigate={navigate} />);
    await fireEvent.press(screen.getByLabelText("알림"));
    expect(navigate).toHaveBeenCalledWith("Notifications");
    await fireEvent.press(screen.getByLabelText("계정"));
    expect(navigate).toHaveBeenCalledWith("Account");
  });

  it("hides the bell when showBell is false", async () => {
    mockHistory = undefined;
    await render(<HeaderActions navigate={jest.fn()} showBell={false} />);
    expect(screen.queryByLabelText("알림")).toBeNull();
    expect(screen.getByLabelText("계정")).toBeTruthy();
  });
});
