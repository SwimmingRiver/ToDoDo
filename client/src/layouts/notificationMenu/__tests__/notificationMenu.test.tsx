import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ToastProvider } from "@/shared/ui/toast/toastContext";
import { setupUser } from "@/test/setupUser";

const s = vi.hoisted(() => ({
  permission: "default" as string,
  reminderDefault: 30 as unknown,
  setDefault: vi.fn(),
  enable: vi.fn(),
  history: { items: [] as unknown[], lastSeenAt: 0 } as { items: { todoId: string; title: string; offsetMinutes: 30; dueAt: string; sentAt: number }[]; lastSeenAt: number } | undefined,
  refetch: vi.fn(),
  markSeen: vi.fn(),
  historyError: false,
}));
vi.mock("@/features/reminders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/reminders")>()),
  getPushPermission: () => s.permission,
  useReminderDefault: () => ({ data: s.reminderDefault }),
  useSetReminderDefault: () => ({ mutate: s.setDefault }),
  useReminderHistory: () => ({
    data: s.history,
    isPending: false,
    isError: s.historyError,
    refetch: s.refetch,
    unreadCount: s.history ? s.history.items.filter((i) => i.sentAt > s.history!.lastSeenAt).length : 0,
  }),
  useMarkHistorySeen: () => ({ mutate: s.markSeen }),
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

const LocationProbe = () => <div data-testid="location">{useLocation().pathname}</div>;
const menuTree = () => (
  <MemoryRouter initialEntries={["/today"]}>
    <ToastProvider>
      <NotificationMenu />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </ToastProvider>
  </MemoryRouter>
);
const renderMenu = () => render(menuTree());

beforeEach(() => {
  s.permission = "default";
  s.reminderDefault = 30;
  s.setDefault.mockReset();
  s.history = { items: [], lastSeenAt: 0 };
  s.refetch.mockReset();
  s.markSeen.mockReset();
  s.historyError = false;
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
    await user.click(screen.getByRole("button", { name: "알림" }));
    expect(screen.getByRole("dialog", { name: "알림" })).toHaveTextContent(text);
  });

  it("default면 [알림 켜기]로 권한을 요청하고 상태가 바뀐다", async () => {
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림" }));
    await user.click(screen.getByRole("button", { name: "알림 켜기" }));
    expect(s.enable).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("이 기기에서 마감 알림을 받고 있어요.")).toBeInTheDocument();
  });

  it("기본 알림을 바꾸면 저장한다", async () => {
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림" }));
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
    await user.click(screen.getByRole("button", { name: "알림" }));
    await user.selectOptions(screen.getByLabelText("기본 알림"), "1440");
    expect(await screen.findByText("저장하지 못했어요")).toBeInTheDocument();
    expect(screen.getByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
  });

  it("미지원이면 기본 알림 선택을 숨긴다", async () => {
    s.permission = "unsupported";
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림" }));
    expect(screen.queryByLabelText("기본 알림")).not.toBeInTheDocument();
  });

  it("Escape로 닫고 트리거로 포커스를 돌려준다", async () => {
    const user = setupUser();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "알림" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

const h = (todoId: string, sentAt: number) => ({
  todoId,
  title: `할 일 ${todoId}`,
  offsetMinutes: 30 as const,
  dueAt: "2026-10-01T01:00:00.000Z",
  sentAt,
});

describe("NotificationMenu 알림 기록", () => {
  it("안 읽은 개수를 배지와 트리거 이름으로 알린다", () => {
    s.history = { items: [h("b", 300), h("a", 200), h("z", 50)], lastSeenAt: 100 };
    renderMenu();
    expect(screen.getByRole("button", { name: "알림, 읽지 않은 알림 2개" })).toHaveTextContent("2");
  });

  it("9개를 넘으면 9+", () => {
    s.history = { items: Array.from({ length: 12 }, (_, i) => h(`t${i}`, 1000 - i)), lastSeenAt: 0 };
    renderMenu();
    expect(screen.getByRole("button", { name: "알림, 읽지 않은 알림 12개" })).toHaveTextContent("9+");
  });

  it("열면 다시 불러오고, 보여준 최신 sentAt까지 읽음 처리한다", async () => {
    s.history = { items: [h("b", 300), h("a", 200)], lastSeenAt: 100 };
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /^알림/ }));
    expect(s.refetch).toHaveBeenCalled();
    expect(s.refetch).toHaveBeenCalled();
    await waitFor(() => expect(s.markSeen).toHaveBeenCalledWith(300));
  });

  it("이미 다 읽었으면 읽음 요청을 보내지 않는다", async () => {
    s.history = { items: [h("a", 100)], lastSeenAt: 100 };
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "알림" }));
    expect(s.markSeen).not.toHaveBeenCalled();
  });

  it("열려 있는 동안엔 읽음 처리 후에도 ●를 유지한다", async () => {
    s.history = { items: [h("b", 300)], lastSeenAt: 100 };
    const user = setupUser();
    const view = renderMenu();
    await user.click(screen.getByRole("button", { name: /^알림/ }));
    s.history = { items: [h("b", 300)], lastSeenAt: 300 }; // 낙관적 업데이트 반영
    view.rerender(menuTree());
    expect(screen.getByRole("button", { name: /할 일 b/ })).toHaveAccessibleName(/읽지 않음/);
  });

  // Review Focus 2
  it("열린 채 새 알림이 오면 그것도 ●로 보이고 읽음 위치가 따라 올라간다", async () => {
    s.history = { items: [h("a", 200)], lastSeenAt: 100 };
    const user = setupUser();
    const view = renderMenu();
    await user.click(screen.getByRole("button", { name: /^알림/ }));
    s.history = { items: [h("b", 400), h("a", 200)], lastSeenAt: 200 };
    view.rerender(menuTree());
    expect(screen.getByRole("button", { name: /할 일 b/ })).toHaveAccessibleName(/읽지 않음/);
    await waitFor(() => expect(s.markSeen).toHaveBeenLastCalledWith(400));
  });

  it("항목을 누르면 할 일 상세로 이동하고 패널을 닫는다", async () => {
    s.history = { items: [h("t 1", 300)], lastSeenAt: 0 };
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /^알림/ }));
    await user.click(screen.getByRole("button", { name: /할 일 t 1/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("/todo/t%201");
    expect(screen.queryByRole("dialog", { name: "알림" })).not.toBeInTheDocument();
  });

  it("재조회가 끝나기 전엔 읽음 처리하지 않고, 끝난 뒤 갱신된 최신 값까지 처리한다", async () => {
    s.history = { items: [h("a", 200)], lastSeenAt: 100 };
    let resolve!: () => void;
    s.refetch.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const user = setupUser();
    const view = renderMenu();
    await user.click(screen.getByRole("button", { name: /^알림/ }));
    expect(s.markSeen).not.toHaveBeenCalled();
    s.history = { items: [h("n", 500), h("a", 200)], lastSeenAt: 100 };
    await act(async () => {
      resolve();
    });
    view.rerender(menuTree());
    await waitFor(() => expect(s.markSeen).toHaveBeenCalledWith(500));
  });

  it("재조회가 실패해도 캐시의 최신 sentAt까지 읽음 처리한다", async () => {
    s.history = { items: [h("b", 300)], lastSeenAt: 100 };
    s.refetch.mockRejectedValue(new Error("network"));
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /^알림/ }));
    await waitFor(() => expect(s.markSeen).toHaveBeenCalledWith(300));
  });

  it("읽음 처리가 실패해 롤백돼도 무한 재시도하지 않는다", async () => {
    s.history = { items: [h("b", 300)], lastSeenAt: 100 };
    const user = setupUser();
    const view = renderMenu();
    await user.click(screen.getByRole("button", { name: /^알림/ }));
    await waitFor(() => expect(s.markSeen).toHaveBeenCalledWith(300));
    for (let i = 0; i < 3; i++) {
      s.history = { items: [h("b", 300)], lastSeenAt: 200 + i };
      view.rerender(menuTree());
      s.history = { items: [h("b", 300)], lastSeenAt: 100 };
      view.rerender(menuTree());
    }
    expect(s.markSeen).toHaveBeenCalledTimes(1);
  });

  it("기록 조회가 실패해도 설정 영역은 동작한다", async () => {
    s.historyError = true;
    const user = setupUser();
    renderMenu();
    await user.click(screen.getByRole("button", { name: /^알림/ }));
    await user.selectOptions(screen.getByLabelText("기본 알림"), "1440");
    expect(s.setDefault).toHaveBeenCalledTimes(1);
  });
});
