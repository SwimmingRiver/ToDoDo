import { render } from "@testing-library/react-native";
import { describe, it, expect } from "@jest/globals";

describe("CalendarScreen", () => {
  it("react-native-calendars의 Calendar를 오류 없이 렌더링한다", async () => {
    const { CalendarScreen } = await import("../CalendarScreen");
    const result = await render(<CalendarScreen />);
    expect(result.toJSON()).toBeTruthy();
  });
});
