import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { setupUser } from "@/test/setupUser";
import RouteErrorPage from "../routeErrorPage";

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

const renderThrowing = (thrower: () => never) => {
  const Thrower = () => thrower();
  const router = createMemoryRouter(
    [
      { path: "/", element: <div>홈 화면</div> },
      {
        path: "/x",
        element: <Thrower />,
        errorElement: <RouteErrorPage variant="fullPage" />,
      },
    ],
    { initialEntries: ["/x"] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

const renderNotFound = () => {
  const router = createMemoryRouter(
    [
      {
        path: "/x",
        loader: () => {
          throw new Response("", { status: 404 });
        },
        element: <div>내용</div>,
        errorElement: <RouteErrorPage variant="inline" />,
      },
    ],
    { initialEntries: ["/x"] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

const renderInlineSequence = () => {
  const Boom = () => {
    throw new Error("boom");
  };
  const ChunkFail = () => {
    throw new Error("Failed to fetch dynamically imported module: /assets/b.js");
  };
  const router = createMemoryRouter(
    [
      {
        errorElement: <RouteErrorPage variant="inline" />,
        children: [
          { path: "/a", element: <Boom /> },
          { path: "/b", element: <ChunkFail /> },
        ],
      },
    ],
    { initialEntries: ["/a"] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

const originalLocation = Object.getOwnPropertyDescriptor(window, "location")!;

describe("RouteErrorPage", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
    vi.mocked(Sentry.captureException).mockClear();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", originalLocation);
  });

  it("오류 화면이 떠 있는 채로 다른 라우트에서 청크 오류가 나면 새로 판단해 새로고침한다", async () => {
    const router = renderInlineSequence();
    expect(await screen.findByRole("heading", { name: "문제가 발생했어요" })).toBeInTheDocument();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    await act(() => router.navigate("/b"));

    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
  });

  it("저장소 쓰기가 막히면 청크 오류여도 새로고침하지 않고 오류 화면을 보여준다", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    renderThrowing(() => {
      throw new Error("Failed to fetch dynamically imported module: /assets/x.js");
    });

    expect(await screen.findByRole("heading", { name: "문제가 발생했어요" })).toBeInTheDocument();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("렌더 오류면 오류 문구와 두 버튼을 보여주고 Sentry에 보고한다", async () => {
    const error = new Error("boom");
    renderThrowing(() => {
      throw error;
    });

    expect(await screen.findByRole("heading", { name: "문제가 발생했어요" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "새로고침" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "홈으로" })).toBeInTheDocument();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("새로고침 버튼은 페이지를 다시 불러온다", async () => {
    const user = setupUser();
    renderThrowing(() => {
      throw new Error("boom");
    });

    await user.click(await screen.findByRole("button", { name: "새로고침" }));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("홈으로 버튼은 /로 이동한다", async () => {
    const user = setupUser();
    const router = renderThrowing(() => {
      throw new Error("boom");
    });

    await user.click(await screen.findByRole("button", { name: "홈으로" }));
    expect(await screen.findByText("홈 화면")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it("404 응답이면 찾을 수 없음 문구와 홈 버튼만, Sentry 보고 안 함", async () => {
    renderNotFound();

    expect(await screen.findByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "홈으로" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "새로고침" })).not.toBeInTheDocument();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("청크 오류 첫 발생이면 화면 없이 1회 새로고침한다", async () => {
    renderThrowing(() => {
      throw new Error("Failed to fetch dynamically imported module: /assets/x.js");
    });

    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("tododo:chunkReloadAt")).not.toBeNull();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("오프라인이면 청크 오류여도 새로고침하지 않고 오류 화면을 보여준다", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderThrowing(() => {
      throw new Error("Failed to fetch dynamically imported module: /assets/x.js");
    });

    expect(await screen.findByRole("heading", { name: "문제가 발생했어요" })).toBeInTheDocument();
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("tododo:chunkReloadAt")).toBeNull();
  });

  it("5분 안에 청크 오류가 재발하면 새로고침하지 않고 오류 화면을 보여준다", async () => {
    sessionStorage.setItem("tododo:chunkReloadAt", String(Date.now()));
    renderThrowing(() => {
      throw new Error("Failed to fetch dynamically imported module: /assets/x.js");
    });

    expect(await screen.findByRole("heading", { name: "문제가 발생했어요" })).toBeInTheDocument();
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
