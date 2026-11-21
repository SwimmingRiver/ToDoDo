import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Todo } from "@tododo/core";
import type { SyncSnapshot } from "@tododo/core/dist/calendarSync/index.js";

let mockPremium = { isPremium: true, isLoading: false };
jest.mock("../../premium", () => ({ useIsPremium: () => mockPremium }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "uid-1" }, loading: false }),
}));
const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

let mockStatus: { data: { connected: boolean; status: "active" | "revoked" } | undefined; isLoading: boolean };
const mockConnect = jest.fn<() => Promise<string>>();
const mockDisconnect = jest.fn<(todos: unknown[], orphans?: string[]) => Promise<{ allDeleted: boolean }>>();
jest.mock("../useCalendarIntegration", () => ({
  useCalendarIntegrationStatus: () => mockStatus,
  useConnectCalendar: () => ({ connect: mockConnect }),
  useDisconnectCalendar: () => ({ disconnect: mockDisconnect }),
}));
jest.mock("../snapshotStorage", () => {
  const core = jest.requireActual("@tododo/core/dist/calendarSync/index.js") as Record<string, unknown>;
  return { loadSnapshot: jest.fn(), findOrphanGoogleEventIds: core.findOrphanGoogleEventIds };
});

import { loadSnapshot } from "../snapshotStorage";
import { CalendarConnectionBar } from "../components/CalendarConnectionBar";

const mockLoadSnapshot = jest.mocked(loadSnapshot);

const makeTodo = (overrides: Partial<Todo>): Todo => ({
  id: "id",
  userId: "uid-1",
  title: "title",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPremium = { isPremium: true, isLoading: false };
  mockStatus = { data: { connected: false, status: "active" }, isLoading: false };
  mockLoadSnapshot.mockResolvedValue(new Map() as SyncSnapshot);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("CalendarConnectionBar 상태별 렌더", () => {
  it("무료면 잠금 안내와 '구독 알아보기'를 보여주고, 누르면 Account로 이동한다", async () => {
    mockPremium = { isPremium: false, isLoading: false };
    await render(<CalendarConnectionBar todos={[]} />);
    expect(screen.getByText("구글 캘린더 연동 (프리미엄)")).toBeTruthy();
    expect(screen.getByText("할 일을 구글 캘린더에 동기화하려면 프리미엄 구독이 필요합니다")).toBeTruthy();
    expect(screen.queryByText("구글 캘린더 연동")).toBeNull();
    await fireEvent.press(screen.getByText("구독 알아보기"));
    expect(mockNavigate).toHaveBeenCalledWith("Account");
  });

  it("엔타이틀먼트 로딩 중이면 버튼·안내 없이 빈 자리만 둔다", async () => {
    mockPremium = { isPremium: false, isLoading: true };
    await render(<CalendarConnectionBar todos={[]} />);
    expect(screen.getByTestId("calendar-connection-placeholder")).toBeTruthy();
    expect(screen.queryByText("구독 알아보기")).toBeNull();
    expect(screen.queryByText("구글 캘린더 연동")).toBeNull();
  });

  it("미연동이면 '구글 캘린더 연동' 버튼", async () => {
    await render(<CalendarConnectionBar todos={[]} />);
    expect(screen.getByText("구글 캘린더 연동")).toBeTruthy();
    expect(screen.queryByText("연동 해제")).toBeNull();
  });

  it("연동이면 '연동 해제' 버튼", async () => {
    mockStatus = { data: { connected: true, status: "active" }, isLoading: false };
    await render(<CalendarConnectionBar todos={[]} />);
    expect(screen.getByText("연동 해제")).toBeTruthy();
    expect(screen.queryByText("연동이 끊겼습니다. 다시 연결해주세요")).toBeNull();
  });

  it("revoked면 안내 문구와 '연동 해제' 버튼", async () => {
    mockStatus = { data: { connected: true, status: "revoked" }, isLoading: false };
    await render(<CalendarConnectionBar todos={[]} />);
    expect(screen.getByText("연동이 끊겼습니다. 다시 연결해주세요")).toBeTruthy();
    expect(screen.getByText("연동 해제")).toBeTruthy();
  });
});

describe("CalendarConnectionBar 연결", () => {
  it.each([
    ["connected", ["연동 완료", "구글 캘린더 연동이 완료됐습니다"]],
    ["error", ["연동 실패", "구글 캘린더 연동 중 오류가 발생했습니다"]],
    ["saveFailed", ["연동 상태 저장 실패", "구글 캘린더를 다시 연결해주세요"]],
  ])("결과가 %s면 해당 Alert를 띄운다", async (result, args) => {
    mockConnect.mockResolvedValue(result);
    await render(<CalendarConnectionBar todos={[]} />);
    await fireEvent.press(screen.getByText("구글 캘린더 연동"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(...args));
  });

  it("cancelled면 아무 Alert도 띄우지 않는다", async () => {
    mockConnect.mockResolvedValue("cancelled");
    await render(<CalendarConnectionBar todos={[]} />);
    await fireEvent.press(screen.getByText("구글 캘린더 연동"));
    expect(mockConnect).toHaveBeenCalled();
    // 처리가 끝나 버튼이 다시 활성화된 뒤에도 Alert가 없어야 한다.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "구글 캘린더 연동" }).props.accessibilityState).toEqual({
        disabled: false,
      }),
    );
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("진행 중에 두 번 눌러도 connect는 한 번만 부른다", async () => {
    let resolve!: (v: string) => void;
    mockConnect.mockImplementation(() => new Promise((r) => (resolve = r)));
    await render(<CalendarConnectionBar todos={[]} />);
    const button = screen.getByText("구글 캘린더 연동");
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    resolve("cancelled");
    // 진행이 끝나면 버튼이 다시 활성화된다 — 상태 정리까지 기다려 다음 테스트로 새지 않게 한다.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "구글 캘린더 연동" }).props.accessibilityState).toEqual({
        disabled: false,
      }),
    );
  });
});

describe("CalendarConnectionBar 해제", () => {
  beforeEach(() => {
    mockStatus = { data: { connected: true, status: "active" }, isLoading: false };
  });

  it("googleEventId가 있는 할 일과 스냅샷 고아 id를 함께 넘기고, 전부 지워지면 완료 Alert", async () => {
    mockLoadSnapshot.mockResolvedValue(
      new Map([
        ["a", { googleEventId: "ev-a" }],
        ["gone", { googleEventId: "ev-gone" }],
      ]) as unknown as SyncSnapshot,
    );
    mockDisconnect.mockResolvedValue({ allDeleted: true });
    const todos = [makeTodo({ id: "a", googleEventId: "ev-a" }), makeTodo({ id: "b" })];
    await render(<CalendarConnectionBar todos={todos} />);
    await fireEvent.press(screen.getByText("연동 해제"));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith("연동 해제 완료", "구글 캘린더 연동이 해제되었습니다"),
    );
    expect(mockLoadSnapshot).toHaveBeenCalledWith("uid-1");
    expect(mockDisconnect).toHaveBeenCalledWith([{ id: "a", googleEventId: "ev-a" }], ["ev-gone"]);
  });

  it("일부가 남으면 부분 실패 Alert", async () => {
    mockDisconnect.mockResolvedValue({ allDeleted: false });
    await render(<CalendarConnectionBar todos={[]} />);
    await fireEvent.press(screen.getByText("연동 해제"));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "일부 이벤트가 남아있습니다",
        "연동은 해제됐지만 일부 이벤트가 구글 캘린더에 그대로 남아있을 수 있습니다. 직접 삭제해주세요",
      ),
    );
  });

  it("해제가 throw하면 실패 Alert", async () => {
    mockDisconnect.mockRejectedValue(new Error("boom"));
    await render(<CalendarConnectionBar todos={[]} />);
    await fireEvent.press(screen.getByText("연동 해제"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("연동 해제 실패", "잠시 후 다시 시도해주세요"));
  });
});
