import { describe, it, expect } from "vitest";
import { nextRefreshAlarm, REFRESH_DEBOUNCE_MS } from "../refreshAlarm";

const NOW = 1_000_000;

describe("nextRefreshAlarm", () => {
  it("알람이 없으면 now + 디바운스", () => {
    expect(nextRefreshAlarm(null, NOW)).toBe(NOW + REFRESH_DEBOUNCE_MS);
  });

  it("더 늦은 알람(다음 발송·창 끝)은 앞당긴다", () => {
    expect(nextRefreshAlarm(NOW + 60_000, NOW)).toBe(NOW + REFRESH_DEBOUNCE_MS);
  });

  it("곧 울릴 미래 알람은 그대로 둔다(디바운스로 모으기)", () => {
    expect(nextRefreshAlarm(NOW + 1_000, NOW)).toBeNull();
  });

  // 재시도가 소진됐거나 런타임이 타이머를 잃어 지난 시각으로 남은 알람은 다시 울리지 않는다.
  // 그대로 두면 refresh 신호가 영영 처리되지 않는다(로컬 wrangler dev 재로드 뒤 실제 발생).
  it("이미 지난 알람은 없는 것으로 보고 다시 건다", () => {
    expect(nextRefreshAlarm(NOW - 7 * 60_000, NOW)).toBe(NOW + REFRESH_DEBOUNCE_MS);
    expect(nextRefreshAlarm(NOW, NOW)).toBe(NOW + REFRESH_DEBOUNCE_MS);
  });
});
