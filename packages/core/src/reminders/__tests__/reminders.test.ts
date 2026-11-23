import { describe, it, expect } from "vitest";
import {
  DEFAULT_REMINDER_SETTING,
  isReminderSetting,
  resolveReminderOffset,
  computeFireAt,
  reminderBody,
  reminderSettingLabel,
  REMINDER_SETTING_OPTIONS,
  toReminderChoice,
  parseReminderSetting,
  formatTimeAgo,
  buildReminderFingerprint,
} from "..";

describe("isReminderSetting", () => {
  it("허용 숫자와 off만 통과한다", () => {
    for (const v of [0, 10, 30, 60, 1440, "off"]) expect(isReminderSetting(v)).toBe(true);
    for (const v of [5, -1, "30", null, undefined, "default", 30.5]) {
      expect(isReminderSetting(v)).toBe(false);
    }
  });
});

describe("resolveReminderOffset", () => {
  it("할 일 값이 없거나 null이면 사용자 기본값을 쓴다", () => {
    expect(resolveReminderOffset(undefined, 60)).toBe(60);
    expect(resolveReminderOffset(null, 10)).toBe(10);
  });

  it("사용자 기본값이 없거나 이상하면 30분", () => {
    expect(DEFAULT_REMINDER_SETTING).toBe(30);
    expect(resolveReminderOffset(undefined, undefined)).toBe(30);
    expect(resolveReminderOffset(undefined, "garbage")).toBe(30);
  });

  it("할 일별 재지정이 기본값보다 우선한다", () => {
    expect(resolveReminderOffset(1440, 30)).toBe(1440);
    expect(resolveReminderOffset(0, 30)).toBe(0);
  });

  it("할 일이 off면 null", () => {
    expect(resolveReminderOffset("off", 30)).toBeNull();
  });

  // Review Focus 1: 설정의 "알림 없음"은 전체를 끈다.
  it("사용자 기본값이 off면 할 일별 재지정이 있어도 null", () => {
    expect(resolveReminderOffset(30, "off")).toBeNull();
    expect(resolveReminderOffset(undefined, "off")).toBeNull();
  });

  it("할 일 값이 이상하면 기본값으로 취급한다", () => {
    expect(resolveReminderOffset(7, 60)).toBe(60);
  });
});

describe("computeFireAt", () => {
  it("마감에서 오프셋만큼 뺀 epoch ms", () => {
    expect(computeFireAt("2026-10-01T09:00:00.000Z", 30)).toBe(Date.parse("2026-10-01T08:30:00.000Z"));
    expect(computeFireAt("2026-10-01T09:00:00.000Z", 1440)).toBe(Date.parse("2026-09-30T09:00:00.000Z"));
  });

  it("파싱할 수 없으면 NaN", () => {
    expect(computeFireAt("not-a-date", 0)).toBeNaN();
  });
});

describe("문구", () => {
  it("reminderBody", () => {
    expect(reminderBody(0)).toBe("지금 마감이에요");
    expect(reminderBody(10)).toBe("10분 후 마감이에요");
    expect(reminderBody(30)).toBe("30분 후 마감이에요");
    expect(reminderBody(60)).toBe("1시간 후 마감이에요");
    expect(reminderBody(1440)).toBe("내일 이 시간에 마감이에요");
  });

  it("reminderSettingLabel", () => {
    expect(reminderSettingLabel("off")).toBe("알림 없음");
    expect(reminderSettingLabel(0)).toBe("정각");
    expect(reminderSettingLabel(10)).toBe("10분 전");
    expect(reminderSettingLabel(30)).toBe("30분 전");
    expect(reminderSettingLabel(60)).toBe("1시간 전");
    expect(reminderSettingLabel(1440)).toBe("하루 전");
  });
});

describe("reminderChoice", () => {
  it("옵션은 알림 없음 + 오프셋 5개", () => {
    expect(REMINDER_SETTING_OPTIONS).toEqual([
      { value: "off", label: "알림 없음" },
      { value: "0", label: "정각" },
      { value: "10", label: "10분 전" },
      { value: "30", label: "30분 전" },
      { value: "60", label: "1시간 전" },
      { value: "1440", label: "하루 전" },
    ]);
  });

  it("toReminderChoice: 없음/null/이상한 값은 default", () => {
    expect(toReminderChoice(undefined)).toBe("default");
    expect(toReminderChoice(null)).toBe("default");
    expect(toReminderChoice(7)).toBe("default");
    expect(toReminderChoice("off")).toBe("off");
    expect(toReminderChoice(60)).toBe("60");
  });

  it("parseReminderSetting: default와 이상한 값은 null", () => {
    expect(parseReminderSetting("default")).toBeNull();
    expect(parseReminderSetting(undefined)).toBeNull();
    expect(parseReminderSetting("")).toBeNull();
    expect(parseReminderSetting("7")).toBeNull();
    expect(parseReminderSetting("off")).toBe("off");
    expect(parseReminderSetting("0")).toBe(0);
    expect(parseReminderSetting("1440")).toBe(1440);
  });
});

describe("formatTimeAgo", () => {
  const NOW = 1_000_000_000_000;
  const MIN = 60_000;
  it.each([
    [30 * 1000, "방금"],
    [-5 * 1000, "방금"],
    [MIN, "1분 전"],
    [59 * MIN, "59분 전"],
    [60 * MIN, "1시간 전"],
    [23 * 60 * MIN, "23시간 전"],
    [24 * 60 * MIN, "1일 전"],
    [7 * 24 * 60 * MIN, "7일 전"],
  ])("%d ms 전 → %s", (ago, text) => {
    expect(formatTimeAgo(NOW - ago, NOW)).toBe(text);
  });
});

describe("buildReminderFingerprint", () => {
  const todo = (o: Record<string, unknown> = {}) => ({
    id: "t1",
    dueAt: "2026-10-01T09:00:00.000Z" as string | null,
    status: "todo",
    archived: false,
    ...o,
  });

  it("ignores todos without dueAt", () => {
    expect(buildReminderFingerprint([todo(), todo({ id: "t2", dueAt: null })])).toBe(
      buildReminderFingerprint([todo()]),
    );
  });

  it("dueAt·status·archived가 바뀌면 달라진다", () => {
    const base = buildReminderFingerprint([todo()]);
    for (const change of [{ dueAt: "2026-10-02T09:00:00.000Z" }, { status: "done" }, { archived: true }]) {
      expect(buildReminderFingerprint([todo(change)])).not.toBe(base);
    }
  });

  it("changes when only reminderOffsetMinutes changes", () => {
    const a = buildReminderFingerprint([todo({ reminderOffsetMinutes: 30 })]);
    const b = buildReminderFingerprint([todo({ reminderOffsetMinutes: "off" })]);
    expect(a).not.toBe(b);
    expect(a).not.toBe(buildReminderFingerprint([todo()]));
  });

  it("order independent", () => {
    const x = todo({ id: "a" });
    const y = todo({ id: "b" });
    expect(buildReminderFingerprint([x, y])).toBe(buildReminderFingerprint([y, x]));
  });
});
