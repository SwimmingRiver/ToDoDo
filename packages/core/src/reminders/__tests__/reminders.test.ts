import { describe, it, expect } from "vitest";
import {
  DEFAULT_REMINDER_SETTING,
  isReminderSetting,
  resolveReminderOffset,
  computeFireAt,
  reminderBody,
  reminderSettingLabel,
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
