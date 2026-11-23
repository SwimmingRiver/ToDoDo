import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import type { User } from "firebase/auth";
import { AuthContext } from "@/features/auth/context/authContext";

vi.mock("@/shared/lib/firebase", () => ({ auth: {}, googleProvider: {} }));
vi.mock("@/shared/lib/firestore", () => ({ db: {} }));
vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

const throwIn = vi.hoisted(() => ({ today: false, legal: false }));

// 실제 App 셸은 Firestore·알림 등 부수 효과가 많아 걷어내고, 셸이 Outlet을 감싼다는
// 구조만 남긴다. "셸 헤더"가 보이면 셸이 유지된 것이다.
vi.mock("@/App", () => ({
  default: () => (
    <div>
      <p>셸 헤더</p>
      <Outlet />
    </div>
  ),
}));
vi.mock("@/features/today/pages/todayPage", () => ({
  default: () => {
    if (throwIn.today) throw new Error("boom");
    return <p>오늘 화면</p>;
  },
}));
vi.mock("@/features/legal/pages/legalPage", () => ({
  default: () => {
    if (throwIn.legal) throw new Error("boom");
    return <h1>이용약관</h1>;
  },
}));

import { routes } from "@/router";

const signedIn = { uid: "u1", email: "a@b.com", displayName: "사용자" } as User;

const renderAt = (path: string, user: User | null) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthContext.Provider value={{ user, loading: false, logout: vi.fn(), refreshUser: vi.fn() }}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
  return router;
};

describe("라우트 오류·404 화면 배선", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    throwIn.today = false;
    throwIn.legal = false;
    sessionStorage.clear();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("로그인 사용자가 없는 주소로 가면 셸 안에서 404 안내를 본다", async () => {
    const router = renderAt("/no-such-page", signedIn);

    expect(await screen.findByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeInTheDocument();
    expect(screen.getByText("셸 헤더")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/no-such-page");
  });

  it("비로그인 사용자가 없는 주소로 가면 로그인으로 이동한다", async () => {
    const router = renderAt("/no-such-page", null);

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("셸 안 페이지가 렌더 중 throw하면 셸은 유지되고 본문에 오류 안내", async () => {
    throwIn.today = true;
    renderAt("/today", signedIn);

    expect(await screen.findByRole("heading", { name: "문제가 발생했어요" })).toBeInTheDocument();
    expect(screen.getByText("셸 헤더")).toBeInTheDocument();
  });

  it("셸 밖 페이지가 throw하면 전체 화면 오류 안내", async () => {
    throwIn.legal = true;
    renderAt("/terms", null);

    expect(await screen.findByRole("heading", { name: "문제가 발생했어요" })).toBeInTheDocument();
    expect(screen.queryByText("셸 헤더")).not.toBeInTheDocument();
  });

  it("정상 페이지는 그대로 열린다", async () => {
    renderAt("/today", signedIn);

    expect(await screen.findByText("오늘 화면")).toBeInTheDocument();
  });
});
