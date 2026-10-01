import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastProvider } from "@/shared/ui/toast/toastContext";
import { setupUser } from "@/test/setupUser";

const s = vi.hoisted(() => ({
  permission: "default" as string,
  reminderDefault: 30 as unknown,
  enable: vi.fn(),
}));
vi.mock("../../../push/pushSupport", () => ({ getPushPermission: () => s.permission }));
vi.mock("../../../push/pushClient", () => ({ enablePushOnThisDevice: s.enable }));
vi.mock("../../../hooks/useReminderSettings", () => ({ useReminderDefault: () => ({ data: s.reminderDefault }) }));

import { ReminderPromptProvider } from "../reminderPrompt";
// PROMPT_SNOOZE_KEY/MS/useReminderPrompt는 컴포넌트가 아닌 값이라
// react-refresh/only-export-components 때문에 reminderPrompt.tsx가 아닌
// 별도 파일(reminderPromptContext.ts)에서 정의·export된다.
import { PROMPT_SNOOZE_KEY, PROMPT_SNOOZE_MS, useReminderPrompt } from "../reminderPromptContext";

let offer: () => void = () => {};
const Probe = () => {
  offer = useReminderPrompt().offerReminders;
  return null;
};
const renderPrompt = () =>
  render(
    <ToastProvider>
      <ReminderPromptProvider>
        <Probe />
      </ReminderPromptProvider>
    </ToastProvider>,
  );

beforeEach(() => {
  s.permission = "default";
  s.reminderDefault = 30;
  s.enable.mockReset().mockResolvedValue("granted");
  localStorage.clear();
});

describe("ReminderPrompt", () => {
  it("권한이 default면 기본값 문구로 안내창을 띄운다", () => {
    renderPrompt();
    act(() => offer());
    expect(screen.getByText("마감 30분 전에 알려드릴까요?")).toBeInTheDocument();
  });

  it.each(["granted", "denied", "unsupported"])("권한이 %s면 띄우지 않는다", (permission) => {
    s.permission = permission;
    renderPrompt();
    act(() => offer());
    expect(screen.queryByText(/알려드릴까요/)).not.toBeInTheDocument();
  });

  it("기본값이 알림 없음이면 띄우지 않는다", () => {
    s.reminderDefault = "off";
    renderPrompt();
    act(() => offer());
    expect(screen.queryByText(/알려드릴까요/)).not.toBeInTheDocument();
  });

  it("[켜기]는 권한을 요청하고 닫는다", async () => {
    const user = setupUser();
    renderPrompt();
    act(() => offer());
    await user.click(screen.getByRole("button", { name: "켜기" }));
    // 핸들러가 pushClient를 동적 import한 뒤 호출하므로 클릭 직후엔 아직 불리지 않았을 수 있다.
    await vi.waitFor(() => expect(s.enable).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(screen.queryByText(/알려드릴까요/)).not.toBeInTheDocument());
  });

  it("[나중에]는 7일간 다시 묻지 않는다", async () => {
    const user = setupUser();
    renderPrompt();
    act(() => offer());
    const before = Date.now();
    await user.click(screen.getByRole("button", { name: "나중에" }));
    expect(Number(localStorage.getItem(PROMPT_SNOOZE_KEY))).toBeGreaterThanOrEqual(before + PROMPT_SNOOZE_MS);
    act(() => offer());
    expect(screen.queryByText(/알려드릴까요/)).not.toBeInTheDocument();
  });

  it("Provider 밖에서는 아무 일도 없다", () => {
    render(<Probe />);
    expect(() => offer()).not.toThrow();
  });
});
