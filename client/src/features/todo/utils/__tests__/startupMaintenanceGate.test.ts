import { describe, it, expect, beforeEach } from "vitest";
import { claimStartupMaintenance, resetStartupMaintenanceGate } from "../startupMaintenanceGate";

describe("claimStartupMaintenance", () => {
  beforeEach(() => resetStartupMaintenanceGate());

  it("같은 사용자는 페이지가 살아 있는 동안 한 번만 실행 권한을 얻는다 — App이 재마운트돼도", () => {
    expect(claimStartupMaintenance("u1")).toBe(true);
    // App(앱 셸) 밖 라우트(/terms 등)에 다녀오면 App이 언마운트→재마운트된다.
    expect(claimStartupMaintenance("u1")).toBe(false);
  });

  it("다른 사용자로 로그인하면 그 사용자 몫으로 다시 실행한다", () => {
    expect(claimStartupMaintenance("u1")).toBe(true);
    expect(claimStartupMaintenance("u2")).toBe(true);
  });
});
