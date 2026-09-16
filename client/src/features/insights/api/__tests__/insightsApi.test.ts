import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/shared/lib/firebase", () => ({
  auth: { currentUser: { uid: "user-1" } },
  googleProvider: {},
}));
vi.mock("@/features/todo/api", () => ({ fetchAllUserTodos: vi.fn() }));

describe("getAllTodosForStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("todoApi의 fetchAllUserTodos를 현재 사용자 uid로 그대로 위임한다 (통계는 아카이브 이력도 필요)", async () => {
    const { fetchAllUserTodos } = await import("@/features/todo/api");
    vi.mocked(fetchAllUserTodos).mockResolvedValue([
      { id: "1", userId: "user-1", status: "done", archived: true } as never,
    ]);

    const { getAllTodosForStats } = await import("../insightsApi");
    const result = await getAllTodosForStats();

    expect(vi.mocked(fetchAllUserTodos)).toHaveBeenCalledWith("user-1");
    expect(result).toEqual([{ id: "1", userId: "user-1", status: "done", archived: true }]);
  });

  it("미인증 상태면 에러를 던진다", async () => {
    const { auth } = await import("@/shared/lib/firebase");
    Object.defineProperty(auth, "currentUser", { value: null, configurable: true });

    const { getAllTodosForStats } = await import("../insightsApi");
    await expect(getAllTodosForStats()).rejects.toThrow("Not authenticated");

    Object.defineProperty(auth, "currentUser", {
      value: { uid: "user-1" },
      configurable: true,
    });
  });
});
