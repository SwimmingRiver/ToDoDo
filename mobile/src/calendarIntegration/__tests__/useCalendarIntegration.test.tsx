import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ReactNode } from "react";

const mockAuth: { currentUser: { uid: string } | null } = { currentUser: { uid: "uid-1" } };
jest.mock("../../firebase", () => ({ db: { __db: true }, get auth() { return mockAuth; } }));
jest.mock("../../auth/useAuthState", () => ({
  useAuthState: () => ({ user: { uid: "uid-1" }, loading: false }),
}));
let mockIsPremium = true;
jest.mock("../../premium", () => ({ useIsPremium: () => ({ isPremium: mockIsPremium, isLoading: false }) }));

const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn<() => Promise<void>>();
jest.mock("firebase/firestore", () => ({
  doc: jest.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  writeBatch: jest.fn(() => ({ update: mockBatchUpdate, commit: mockBatchCommit })),
}));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock("../calendarProxyApi", () => ({
  getOAuthStartUrl: jest.fn(),
  disconnectCalendar: jest.fn(),
}));

import { getDoc, setDoc } from "firebase/firestore";
import * as WebBrowser from "expo-web-browser";
import { disconnectCalendar, getOAuthStartUrl } from "../calendarProxyApi";
import {
  useCalendarIntegrationStatus,
  useConnectCalendar,
  useDisconnectCalendar,
} from "../useCalendarIntegration";
import { markCalendarRevoked } from "../markCalendarRevoked";
import { DisconnectPartialError } from "@tododo/core/dist/calendarSync/index.js";

const mockGetDoc = jest.mocked(getDoc);
const mockSetDoc = jest.mocked(setDoc);
const mockOpen = jest.mocked(WebBrowser.openAuthSessionAsync);
const mockStart = jest.mocked(getOAuthStartUrl);
const mockDisconnect = jest.mocked(disconnectCalendar);

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
const wrap = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.currentUser = { uid: "uid-1" };
  mockIsPremium = true;
  mockStart.mockResolvedValue("https://accounts.google.com/auth");
  mockSetDoc.mockResolvedValue(undefined);
  mockBatchCommit.mockResolvedValue(undefined);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("useCalendarIntegrationStatus", () => {
  it("연동 문서를 읽어 상태를 반환한다", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ connected: true, status: "revoked" }) } as never);
    const client = makeClient();
    const { result } = await renderHook(() => useCalendarIntegrationStatus(), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ connected: true, status: "revoked" });
    expect(client.getQueryData(["calendarIntegration", "uid-1"])).toEqual({ connected: true, status: "revoked" });
  });

  it("문서가 없으면 미연동", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => undefined } as never);
    const { result } = await renderHook(() => useCalendarIntegrationStatus(), { wrapper: wrap(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ connected: false, status: "active" });
  });

  it("프리미엄이 아니면 조회하지 않는다", async () => {
    mockIsPremium = false;
    const { result } = await renderHook(() => useCalendarIntegrationStatus(), { wrapper: wrap(makeClient()) });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetDoc).not.toHaveBeenCalled();
  });
});

describe("useConnectCalendar", () => {
  const connectWith = async (client = makeClient()) => {
    const { result } = await renderHook(() => useConnectCalendar(), { wrapper: wrap(client) });
    return result.current.connect();
  };

  it("success + calendarConnected=1이면 연동 문서를 쓰고 connected", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: "tododo://calendar?calendarConnected=1" });
    const client = makeClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await expect(connectWith(client)).resolves.toBe("connected");
    expect(mockOpen).toHaveBeenCalledWith("https://accounts.google.com/auth", "tododo://calendar");
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, data, options] = mockSetDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>, unknown];
    expect(ref).toEqual({ path: "calendarIntegrations/uid-1" });
    expect(data).toEqual({ connected: true, connectedAt: expect.any(String), status: "active" });
    expect(new Date(data.connectedAt as string).toISOString()).toBe(data.connectedAt);
    expect(options).toEqual({ merge: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["calendarIntegration", "uid-1"] });
  });

  it("success + calendarError=1이면 error이고 쓰지 않는다", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: "tododo://calendar?calendarError=1" });
    await expect(connectWith()).resolves.toBe("error");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("사용자가 브라우저를 닫으면 cancelled", async () => {
    mockOpen.mockResolvedValue({ type: "cancel" } as never);
    await expect(connectWith()).resolves.toBe("cancelled");
    mockOpen.mockResolvedValue({ type: "dismiss" } as never);
    await expect(connectWith()).resolves.toBe("cancelled");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("잠김(locked) 등 cancel/dismiss가 아닌 실패는 error", async () => {
    mockOpen.mockResolvedValue({ type: "locked" } as never);
    await expect(connectWith()).resolves.toBe("error");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("복귀 URL의 쿼리가 깨져 있어도 throw하지 않고 error", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: "tododo://calendar?%E0%A4%A=1&calendar%ZZ=1" });
    await expect(connectWith()).resolves.toBe("error");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("success + calendarCancelled=1이면 cancelled", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: "tododo://calendar?calendarCancelled=1" });
    await expect(connectWith()).resolves.toBe("cancelled");
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("연동 문서 쓰기가 실패하면 saveFailed", async () => {
    mockOpen.mockResolvedValue({ type: "success", url: "tododo://calendar?calendarConnected=1" });
    mockSetDoc.mockRejectedValue(new Error("offline"));
    await expect(connectWith()).resolves.toBe("saveFailed");
  });

  it("OAuth 시작 URL 요청이 실패하면 error이고 브라우저를 열지 않는다", async () => {
    mockStart.mockRejectedValue(new Error("network"));
    await expect(connectWith()).resolves.toBe("error");
    expect(mockOpen).not.toHaveBeenCalled();
  });
});

describe("useDisconnectCalendar", () => {
  const todos = [
    { id: "t1", googleEventId: "g1" },
    { id: "t2", googleEventId: "g2" },
  ];

  it("삭제 확인된 id만 비우고, 연동 무효화가 끝난 뒤 todos를 무효화한다", async () => {
    mockDisconnect.mockResolvedValue({ deletedGoogleEventIds: ["g1", "o1"] });
    const client = makeClient();
    const order: string[] = [];
    let releaseIntegration: () => void = () => {};
    jest.spyOn(client, "invalidateQueries").mockImplementation(((filters: { queryKey: unknown[] }) => {
      const key = JSON.stringify(filters.queryKey);
      order.push(`start:${key}`);
      if (filters.queryKey[0] === "calendarIntegration") {
        return new Promise<void>((resolve) => {
          releaseIntegration = () => {
            order.push(`resolved:${key}`);
            resolve();
          };
        });
      }
      return Promise.resolve();
    }) as never);
    const remove = jest.spyOn(client, "removeQueries");
    mockSetDoc.mockImplementation((async () => {
      order.push("setDoc");
    }) as never);

    const { result } = await renderHook(() => useDisconnectCalendar(), { wrapper: wrap(client) });
    const pending = result.current.disconnect(todos, ["o1"]);
    await waitFor(() => expect(order).toContain('start:["calendarIntegration","uid-1"]'));
    expect(order).not.toContain('start:["todos","uid-1"]');
    releaseIntegration();
    await expect(pending).resolves.toEqual({ allDeleted: false });

    expect(mockDisconnect).toHaveBeenCalledWith(["g1", "g2", "o1"]);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledWith({ path: "todos/t1" }, { googleEventId: null });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: "calendarIntegrations/uid-1" },
      { connected: false, status: "active" },
      { merge: true },
    );
    expect(order).toEqual([
      "setDoc",
      'start:["calendarIntegration","uid-1"]',
      'resolved:["calendarIntegration","uid-1"]',
      'start:["todos","uid-1"]',
    ]);
    expect(remove).toHaveBeenCalledWith({ queryKey: ["googleCalendarEvents"] });
  });

  it("전부 삭제되면 allDeleted:true", async () => {
    mockDisconnect.mockResolvedValue({ deletedGoogleEventIds: ["g1", "g2"] });
    const { result } = await renderHook(() => useDisconnectCalendar(), { wrapper: wrap(makeClient()) });
    await expect(result.current.disconnect(todos)).resolves.toEqual({ allDeleted: true });
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
  });

  it("아무것도 삭제되지 않으면 batch도 todos 무효화도 하지 않는다", async () => {
    mockDisconnect.mockResolvedValue({ deletedGoogleEventIds: [] });
    const client = makeClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(() => useDisconnectCalendar(), { wrapper: wrap(client) });
    await expect(result.current.disconnect(todos)).resolves.toEqual({ allDeleted: false });
    expect(mockBatchCommit).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["todos", "uid-1"] });
  });
});

describe("useDisconnectCalendar — 묶음 도중 실패", () => {
  const todos = [
    { id: "t1", googleEventId: "g1" },
    { id: "t2", googleEventId: "g2" },
  ];

  // 앞 묶음에서 이미 구글에서 지워진 이벤트의 googleEventId는 지우고(이벤트가 없다), 토큰은
  // 아직 남아 있으니 연동 해제 상태로 바꾸지 않는다(사용자가 다시 시도할 수 있다).
  it("삭제 확인된 id만 비우고, connected는 그대로 둔 채 에러를 다시 던진다", async () => {
    const partial = new DisconnectPartialError(new Error("연동 해제 실패"), ["g1", "o1"]);
    mockDisconnect.mockRejectedValue(partial);
    const { result } = await renderHook(() => useDisconnectCalendar(), { wrapper: wrap(makeClient()) });

    await expect(result.current.disconnect(todos, ["o1"])).rejects.toBe(partial);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledWith({ path: "todos/t1" }, { googleEventId: null });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("일반 오류면 Firestore를 건드리지 않고 그대로 던진다", async () => {
    mockDisconnect.mockRejectedValue(new Error("network"));
    const { result } = await renderHook(() => useDisconnectCalendar(), { wrapper: wrap(makeClient()) });
    await expect(result.current.disconnect(todos)).rejects.toThrow("network");
    expect(mockBatchUpdate).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});

describe("markCalendarRevoked", () => {
  it("status:revoked를 merge로 쓰고 연동 상태를 무효화한다", async () => {
    const client = makeClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await markCalendarRevoked(client);
    expect(mockSetDoc).toHaveBeenCalledWith({ path: "calendarIntegrations/uid-1" }, { status: "revoked" }, { merge: true });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["calendarIntegration", "uid-1"] });
  });

  it("쓰기가 실패해도 throw하지 않는다", async () => {
    mockSetDoc.mockRejectedValue(new Error("offline"));
    await expect(markCalendarRevoked(makeClient())).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it("로그인하지 않았으면 아무것도 하지 않는다", async () => {
    mockAuth.currentUser = null;
    await markCalendarRevoked(makeClient());
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});
