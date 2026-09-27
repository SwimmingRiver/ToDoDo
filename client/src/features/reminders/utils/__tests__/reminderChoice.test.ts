import { describe, it, expect } from "vitest";
import { REMINDER_SETTING_OPTIONS, parseReminderSetting, toReminderChoice } from "../reminderChoice";

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
