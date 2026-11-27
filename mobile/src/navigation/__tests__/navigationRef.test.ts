import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { navigationRef, onNavigationReady, onNavigationStateChange } from "../navigationRef";

const sentry = jest.requireMock("@sentry/react-native") as { addBreadcrumb: jest.Mock };
const crumbs = () => sentry.addBreadcrumb.mock.calls.map((c) => c[0] as { category: string; data: Record<string, unknown> });

let currentRoute: { name: string; key: string; params?: object } | undefined;

describe("화면 이동 breadcrumb", () => {
  beforeEach(() => {
    sentry.addBreadcrumb.mockClear();
    jest.spyOn(navigationRef, "getCurrentRoute").mockImplementation((() => currentRoute) as never);
    jest.spyOn(navigationRef, "isReady").mockReturnValue(true);
  });

  it("준비되면 nav_ready와 첫 화면을, 이후 화면이 바뀔 때마다 from/to를 남긴다(params는 남기지 않는다)", () => {
    currentRoute = { name: "오늘", key: "k1" };
    onNavigationReady();
    currentRoute = { name: "TodoDetail", key: "k2", params: { id: "todo-secret-id" } };
    onNavigationStateChange();

    expect(crumbs()).toEqual([
      { category: "app.lifecycle", type: "info", level: "info", data: { stage: "nav_ready" } },
      { category: "navigation", type: "navigation", data: { from: undefined, to: "오늘" } },
      { category: "navigation", type: "navigation", data: { from: "오늘", to: "TodoDetail" } },
    ]);
    expect(JSON.stringify(crumbs())).not.toContain("todo-secret-id");
  });

  it("같은 화면에 머무는 상태 변경(파라미터 갱신 등)은 남기지 않는다", () => {
    currentRoute = { name: "목록", key: "k3" };
    onNavigationStateChange();
    sentry.addBreadcrumb.mockClear();
    onNavigationStateChange();
    expect(crumbs()).toEqual([]);
  });
});
