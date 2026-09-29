import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));

import { useNotificationClickNavigation } from "../useNotificationClickNavigation";

const installServiceWorker = () => {
  const target = new EventTarget();
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: target });
  return target;
};
const post = (target: EventTarget, data: unknown) =>
  target.dispatchEvent(new MessageEvent("message", { data }));

afterEach(() => {
  navigateMock.mockReset();
  // @ts-expect-error 테스트에서 설치한 속성 제거
  delete navigator.serviceWorker;
});

describe("useNotificationClickNavigation", () => {
  it("알림 클릭 메시지의 todoId로 상세 화면에 이동한다", () => {
    const sw = installServiceWorker();
    renderHook(() => useNotificationClickNavigation());
    post(sw, {
      messageType: "notification-clicked",
      isFirebaseMessaging: true,
      fcmOptions: { link: "https://tododo.app/todo/t1" },
      data: { todoId: "t1" },
    });
    expect(navigateMock).toHaveBeenCalledWith("/todo/t1");
  });

  it("todoId가 없으면 링크의 경로로 이동한다", () => {
    const sw = installServiceWorker();
    renderHook(() => useNotificationClickNavigation());
    post(sw, { messageType: "notification-clicked", fcmOptions: { link: "https://tododo.app/todo/t2?x=1" } });
    expect(navigateMock).toHaveBeenCalledWith("/todo/t2?x=1");
  });

  it("알림 클릭이 아닌 메시지는 무시한다", () => {
    const sw = installServiceWorker();
    renderHook(() => useNotificationClickNavigation());
    post(sw, { messageType: "push-received", data: { todoId: "t1" } });
    post(sw, "hello");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("언마운트 후에는 반응하지 않는다", () => {
    const sw = installServiceWorker();
    const { unmount } = renderHook(() => useNotificationClickNavigation());
    unmount();
    post(sw, { messageType: "notification-clicked", data: { todoId: "t1" } });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("serviceWorker가 없어도 에러 없이 동작한다", () => {
    expect(() => renderHook(() => useNotificationClickNavigation())).not.toThrow();
  });
});
