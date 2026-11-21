import { describe, it, expect, vi, beforeEach } from "vitest";

// 각 청크 모듈이 실제로 import(=다운로드)됐는지를 mock 팩토리 실행 여부로 기록한다.
// vi.mock은 모듈 캐시 때문에 팩토리가 파일당 한 번만 돌므로, 테스트마다
// resetModules + doMock으로 다시 등록해 새로 센다.
const loaded = new Set<string>();
const chunks: Record<string, string> = {
  "@/App": "App",
  "@/features/today/pages/todayPage": "today",
  "@/features/todo/pages/todoListPage": "todoList",
  "@/features/todo/components/todoDetail/todoDetail": "todoDetail",
  "@/features/dashboard/Pages/calendarPage": "calendar",
  "@/features/kanban/pages/kanbanPage": "kanban",
  "@/features/insights/pages/insightsPage": "insights",
  "@/features/billing/pages/premiumPage": "premium",
};

const preloadAt = async (pathname: string) => {
  const { preloadSignedInRoute } = await import("@/router");
  await preloadSignedInRoute(pathname);
};

describe("preloadSignedInRoute", () => {
  beforeEach(() => {
    loaded.clear();
    vi.resetModules();
    vi.doMock("@/shared/lib/firebase", () => ({ auth: {}, googleProvider: {} }));
    vi.doMock("@/shared/lib/firestore", () => ({ db: {} }));
    for (const [path, name] of Object.entries(chunks)) {
      vi.doMock(path, () => {
        loaded.add(name);
        return { default: () => null };
      });
    }
  });

  it.each([
    ["/", "today"],
    ["/today", "today"],
    ["/todo", "todoList"],
    ["/todo/abc123", "todoDetail"],
    ["/calendar", "calendar"],
    ["/kanban", "kanban"],
    ["/insights", "insights"],
    ["/premium", "premium"],
  ])("%s → 셸과 %s 청크를 미리 받는다", async (path, page) => {
    await preloadAt(path);
    expect([...loaded].sort()).toEqual(["App", page].sort());
  });

  it.each(["/login", "/guest", "/terms", "/constructor", "/no-such-page"])(
    "%s는 셸 밖이거나 모르는 주소라 아무것도 받지 않는다",
    async (path) => {
      await preloadAt(path);
      expect(loaded.size).toBe(0);
    },
  );
});
