import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "@/shared/ui/toast/toastContext";
import { setupUser } from "@/test/setupUser";

const s = vi.hoisted(() => ({
  permission: "default" as string,
  reminderDefault: 30 as unknown,
  setDefault: vi.fn(),
  enable: vi.fn(),
}));
vi.mock("@/features/reminders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/reminders")>()),
  getPushPermission: () => s.permission,
  useReminderDefault: () => ({ data: s.reminderDefault }),
  useSetReminderDefault: () => ({ mutate: s.setDefault }),
}));
vi.mock("@/features/reminders/push/pushClient", () => ({ enablePushOnThisDevice: s.enable }));
// importOriginal이 실제 배럴을 읽으므로 Firebase 초기화를 막는다(CI는 API 키가 비어 있어 실패한다).
vi.mock("@/shared/lib/firebase", () => ({ auth: { currentUser: { uid: "user-1" } }, googleProvider: {} }));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
// importOriginal이 배럴의 useReminderRefresh까지 실행하며 @/features/todo/hooks →
// todoApi.ts를 로드한다. todoApi.ts는 모듈 최상단에서 collection(db, "todos")를
// 호출하는데(전형적인 파이어스토어 초기화 패턴), 위의 db 목이 진짜 Firestore
// 인스턴스가 아니라 이 호출 자체가 던진다. useGetTodos.test.tsx도 같은 이유로
// 이 배럴을 목한다.
vi.mock("@/features/todo/hooks", () => ({ useGetTodos: () => ({ data: undefined }) }));

import NotificationMenu from "../notificationMenu";

const renderMenu = () =>
  render(
    <ToastProvider>
      <NotificationMenu />
    </ToastProvider>,
  );

beforeEach(() => {
  s.permission = "default";
  s.reminderDefault = 30;
  s.setDefault.mockReset();
  s.enable.mockReset().mockImplementation(async () => {
    s.permission = "granted";
    return "granted";
  });
});

describe("NotificationMenu", () => {
  it.each([
    ["granted", "이 기기에서 마감 알림을 받고 있어요."],
    ["default", "알림을 켜면 탭을 닫아도 마감 전에 알려드려요."],
    ["denied", "브라우저에서 알림이 차단돼 있어요. 주소창 왼쪽의 사이트 설정에서 알림을 허용해 주세요."],
    ["unsupported", "이 브라우저에서는 알림을 받을 수 없어요."],
  ])("%s 상태 문구", async (permission, text) => {
    s.permission = permission;
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림 설정" }));
    expect(screen.getByRole("dialog", { name: "알림 설정" })).toHaveTextContent(text);
  });

  it("default면 [알림 켜기]로 권한을 요청하고 상태가 바뀐다", async () => {
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림 설정" }));
    await user.click(screen.getByRole("button", { name: "알림 켜기" }));
    expect(s.enable).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("이 기기에서 마감 알림을 받고 있어요.")).toBeInTheDocument();
  });

  it("기본 알림을 바꾸면 저장한다", async () => {
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림 설정" }));
    await user.selectOptions(screen.getByLabelText("기본 알림"), "1440");
    expect(s.setDefault).toHaveBeenCalledTimes(1);
    expect(s.setDefault.mock.calls[0][0]).toBe(1440);
  });

  it("기본 알림 저장이 실패하면 에러 토스트를 보여준다", async () => {
    s.setDefault.mockImplementation((_setting: unknown, options?: { onError?: (e: unknown) => void }) => {
      options?.onError?.(new Error("write failed"));
    });
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림 설정" }));
    await user.selectOptions(screen.getByLabelText("기본 알림"), "1440");
    expect(await screen.findByText("저장하지 못했어요")).toBeInTheDocument();
    expect(screen.getByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
  });

  it("미지원이면 기본 알림 선택을 숨긴다", async () => {
    s.permission = "unsupported";
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림 설정" }));
    expect(screen.queryByLabelText("기본 알림")).not.toBeInTheDocument();
  });

  it("Escape로 닫고 트리거로 포커스를 돌려준다", async () => {
    const user = setupUser();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "알림 설정" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
