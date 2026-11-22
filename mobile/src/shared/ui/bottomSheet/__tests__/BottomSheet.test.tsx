import { render, screen } from "@testing-library/react-native";
import { describe, it, expect, jest } from "@jest/globals";
import { BottomSheet } from "../BottomSheet";

describe("BottomSheet", () => {
  it("옵션이 많아도 스크롤 영역 안에 있어 끝까지 닿는다", async () => {
    const options = Array.from({ length: 30 }, (_, i) => ({ value: `p${i}`, label: `프로젝트 ${i}` }));
    await render(
      <BottomSheet isOpen onClose={jest.fn()} title="프로젝트" options={options} onSelect={jest.fn()} />,
    );
    const scroll = screen.getByTestId("bottom-sheet-options");
    expect(scroll.type).toBe("RCTScrollView");
    expect(screen.getByText("프로젝트 29")).toBeTruthy();
    expect(screen.getByLabelText("취소")).toBeTruthy();
  });
});
