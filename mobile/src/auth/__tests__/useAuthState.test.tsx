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
});
