import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { toDatetimeLocalValue } from "../date";

describe("toDatetimeLocalValue", () => {
  // CI(ubuntu-latest)는 TZ 미설정 시 UTC로 실행되는데, UTC 환경에서는 로컬 시각과 UTC 시각이
  // 같아서 new Date(iso).toISOString().slice(0,16)(버그가 있던 예전 구현)도 우연히 같은 값을
  // 반환해 회귀를 못 잡는다. UTC와 다른 타임존(Asia/Seoul, UTC+9)을 명시적으로 고정해야
  // 이 테스트가 실제로 의미를 가진다.
  let originalTz: string | undefined;

  beforeAll(() => {
    originalTz = process.env.TZ;
    process.env.TZ = "Asia/Seoul";
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("ISO 문자열을 로컬 타임존 기준 'yyyy-MM-ddTHH:mm'으로 되돌린다", () => {
    // 로컬 2026-07-10 08:30을 저장(UTC ISO 변환)했다가 다시 불러오는 왕복 시나리오.
    // UTC보다 시간이 빠른 타임존(예: Asia/Seoul, UTC+9)에서 이 시각을 UTC 기준으로 잘못
    // 읽으면 날짜가 전날(07-09)로 밀린다 — 이 테스트는 그 회귀를 방지한다.
    const local = new Date(2026, 6, 10, 8, 30);
    const iso = local.toISOString();

    expect(toDatetimeLocalValue(iso)).toBe("2026-07-10T08:30");
  });

  it("자정에 가까운 시각도 날짜가 밀리지 않는다", () => {
    const local = new Date(2026, 6, 10, 0, 5);
    const iso = local.toISOString();

    expect(toDatetimeLocalValue(iso)).toBe("2026-07-10T00:05");
  });

  it("한 자리 시/분/월/일도 두 자리로 패딩한다", () => {
    const local = new Date(2026, 0, 5, 9, 7);
    const iso = local.toISOString();

    expect(toDatetimeLocalValue(iso)).toBe("2026-01-05T09:07");
  });
});
