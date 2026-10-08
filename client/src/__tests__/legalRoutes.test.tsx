import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { User } from "firebase/auth";
import { AuthContext } from "@/features/auth/context/authContext";

vi.mock("@/shared/lib/firebase", () => ({ auth: {}, googleProvider: {} }));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));

import { routes } from "@/router";

const signedIn = { uid: "u1", email: "a@b.com", displayName: "사용자" } as User;

const renderAt = (path: string, user: User | null) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthContext.Provider value={{ user, loading: false, logout: vi.fn() }}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
  return router;
};

describe("법적 페이지 라우트", () => {
  it.each([
    ["/terms", "이용약관"],
    ["/privacy", "개인정보처리방침"],
    ["/refund", "환불 정책"],
  ])("로그아웃 상태에서 %s가 열린다", async (path, title) => {
    const router = renderAt(path, null);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
  });

  it("로그인 상태에서도 /terms에 머문다(/today로 보내지 않는다)", async () => {
    const router = renderAt("/terms", signedIn);
    expect(await screen.findByRole("heading", { level: 1, name: "이용약관" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/terms");
  });
});
