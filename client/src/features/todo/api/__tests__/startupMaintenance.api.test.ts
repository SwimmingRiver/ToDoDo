import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Sentry from "@sentry/react";

// 앱 진입 정리 작업의 Firestore 쓰기 기대값은 core(packages/core/src/recurring/__tests__/
// startupMaintenanceApi.test.ts)가 검증한다. 웹은 db·uid 주입, 기본 인자, 반환값(.written),
// 그리고 실패 보고(console + Sentry) 콜백 연결만 맡으므로 여기서는 그것만 검증한다.

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

const { mockAuth, mockDb } = vi.hoisted(() => ({
  mockAuth: { currentUser: { uid: "test-user-id" } } as {
    currentUser: { uid: string } | null;
  },
  mockDb: { __fake: "db" },
}));

vi.mock("@/shared/lib/firebase", () => ({ auth: mockAuth, googleProvider: {} }));
vi.mock("@/shared/lib/firestore", () => ({ db: mockDb }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  getDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock("@tododo/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tododo/core")>();
  return { ...actual, runStartupMaintenance: vi.fn() };
});

beforeEach(async () => {
  mockAuth.currentUser = { uid: "test-user-id" };
  const core = await import("@tododo/core");
  vi.mocked(core.runStartupMaintenance).mockReset();
  vi.mocked(core.runStartupMaintenance).mockResolvedValue({ written: 3, failedSweeps: [] });
  vi.mocked(Sentry.captureException).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runStartupMaintenance (web wrapper)", () => {
  it("db·uid·옵션을 core에 넘기고 written만 반환한다", async () => {
    const core = await import("@tododo/core");
    const { runStartupMaintenance } = await import("../todoApi");
    const horizonEnd = new Date("2026-07-15T00:00:00");

    const written = await runStartupMaintenance(90, horizonEnd);

    expect(written).toBe(3);
    expect(core.runStartupMaintenance).toHaveBeenCalledTimes(1);
    expect(core.runStartupMaintenance).toHaveBeenCalledWith(
      mockDb,
      "test-user-id",
      expect.objectContaining({ cutoffDays: 90, horizonEnd }),
    );
  });

  it("인자를 생략하면 cutoffDays 30과 기본 호라이즌을 쓴다", async () => {
    const core = await import("@tododo/core");
    const { runStartupMaintenance } = await import("../todoApi");

    await runStartupMaintenance();

    const options = vi.mocked(core.runStartupMaintenance).mock.calls[0][2];
    expect(options?.cutoffDays).toBe(30);
    expect(options?.horizonEnd).toBeInstanceOf(Date);
  });

  it("로그인하지 않았으면 core를 호출하지 않고 reject한다", async () => {
    mockAuth.currentUser = null;
    const core = await import("@tododo/core");
    const { runStartupMaintenance } = await import("../todoApi");

    await expect(runStartupMaintenance()).rejects.toThrow("Not authenticated");
    expect(core.runStartupMaintenance).not.toHaveBeenCalled();
  });

  it("onSweepError 콜백은 콘솔과 Sentry(tags.sweep)로 보고한다", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const core = await import("@tododo/core");
    const { runStartupMaintenance } = await import("../todoApi");
    await runStartupMaintenance();

    const onSweepError = vi.mocked(core.runStartupMaintenance).mock.calls[0][2]?.onSweepError;
    expect(onSweepError).toBeTypeOf("function");

    const sweepError = new Error("permission-denied");
    onSweepError?.(sweepError, "archived");

    expect(consoleErrorSpy).toHaveBeenCalledWith("앱 진입 유지보수 실패 (archived):", sweepError);
    expect(Sentry.captureException).toHaveBeenCalledWith(sweepError, {
      tags: { sweep: "archived" },
    });
  });
});
