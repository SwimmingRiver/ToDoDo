import { describe, it, expect } from "vitest";
import { resolveScheme, parsePreference, THEME_STORAGE_KEY } from "..";

describe("resolveScheme", () => {
  it.each([
    ["system", false, "light"],
    ["system", true, "dark"],
    ["light", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["dark", true, "dark"],
  ] as const)("preference=%s, osDark=%s → %s", (pref, osDark, expected) => {
    expect(resolveScheme(pref, osDark)).toBe(expected);
  });
});

describe("parsePreference", () => {
  it.each(["system", "light", "dark"] as const)("유효값 %s는 그대로", (v) => {
    expect(parsePreference(v)).toBe(v);
  });
  it.each([null, undefined, "", "Dark", "auto", 1, {}])("잘못된 값 %s는 system", (v) => {
    expect(parsePreference(v)).toBe("system");
  });
});

it("저장 키는 tododo:theme", () => {
  expect(THEME_STORAGE_KEY).toBe("tododo:theme");
});
