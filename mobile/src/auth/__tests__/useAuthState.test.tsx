import { act, renderHook, waitFor } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";

jest.mock("../../firebase", () => ({ auth: {} }));

const authStateCallbacks: Array<(user: unknown) => void> = [];
jest.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    authStateCallbacks.push(cb);
    return () => {};
  },
}));

describe("useAuthState", () => {
  it("초기값은 loading true, user null이다", async () => {
    const { useAuthState } = await import("../useAuthState");
    const { result } = await renderHook(() => useAuthState());

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it("onAuthStateChanged 콜백이 오면 loading false, user가 채워진다", async () => {
    const { useAuthState } = await import("../useAuthState");
    const { result } = await renderHook(() => useAuthState());

    await act(async () => {
      authStateCallbacks[authStateCallbacks.length - 1]({ uid: "u1" });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual({ uid: "u1" });
  });

  it("로그인 시 uid만 setUser, 로그아웃 시 setUser(null)", async () => {
    const sentry = jest.requireMock("@sentry/react-native") as { setUser: jest.Mock };
    sentry.setUser.mockClear();
    const { useAuthState } = await import("../useAuthState");
    await renderHook(() => useAuthState());
    const cb = authStateCallbacks[authStateCallbacks.length - 1];

    await act(async () => cb({ uid: "u1", email: "a@b.c" }));
    expect(sentry.setUser).toHaveBeenLastCalledWith({ id: "u1" });

    await act(async () => cb(null));
    expect(sentry.setUser).toHaveBeenLastCalledWith(null);
  });

  it("로그인 확정 대기 시작과 끝(첫 콜백 1회만)을 breadcrumb으로 남긴다", async () => {
    const sentry = jest.requireMock("@sentry/react-native") as { addBreadcrumb: jest.Mock };
    sentry.addBreadcrumb.mockClear();
    const { useAuthState } = await import("../useAuthState");
    await renderHook(() => useAuthState());
    const cb = authStateCallbacks[authStateCallbacks.length - 1];
    await act(async () => cb({ uid: "u1", email: "a@b.c" }));
    await act(async () => cb(null));

    const data = sentry.addBreadcrumb.mock.calls.map((c) => (c[0] as { data: unknown }).data);
    expect(data).toEqual([{ stage: "auth_wait_start" }, { stage: "auth_resolved", signed_in: true }]);
    expect(JSON.stringify(sentry.addBreadcrumb.mock.calls)).not.toContain("a@b.c");
    expect(JSON.stringify(sentry.addBreadcrumb.mock.calls)).not.toContain("u1");
  });
});
