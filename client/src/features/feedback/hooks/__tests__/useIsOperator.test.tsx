import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const authMock = vi.hoisted(() => ({ auth: { currentUser: null as unknown } }));
vi.mock("@/shared/lib/firebase", () => authMock);

import { useIsOperator } from "../useIsOperator";

const setUser = (getIdTokenResult: () => Promise<unknown>) => {
  authMock.auth.currentUser = { getIdTokenResult };
};

describe("useIsOperator", () => {
  beforeEach(() => {
    authMock.auth.currentUser = null;
  });

  it("operator 클레임이 true면 운영자다", async () => {
    setUser(() => Promise.resolve({ claims: { operator: true } }));
    const { result } = renderHook(() => useIsOperator());
    expect(result.current).toEqual({ isOperator: false, isLoading: true });
    await waitFor(() => expect(result.current).toEqual({ isOperator: true, isLoading: false }));
  });

  it("클레임이 없으면 운영자가 아니다", async () => {
    setUser(() => Promise.resolve({ claims: {} }));
    const { result } = renderHook(() => useIsOperator());
    await waitFor(() => expect(result.current).toEqual({ isOperator: false, isLoading: false }));
  });

  it("로그인 사용자가 없으면 즉시 {false,false}", () => {
    const { result } = renderHook(() => useIsOperator());
    expect(result.current).toEqual({ isOperator: false, isLoading: false });
  });

  it("토큰 조회가 실패하면 운영자가 아니며 로딩을 끝낸다", async () => {
    setUser(() => Promise.reject(new Error("x")));
    const { result } = renderHook(() => useIsOperator());
    await waitFor(() => expect(result.current).toEqual({ isOperator: false, isLoading: false }));
  });
});
