import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { setupUser } from "@/test/setupUser";
import SNB from "../snb";

const renderSNB = (onFeedbackClick = vi.fn()) => {
  render(
    <MemoryRouter>
      <SNB isopen setIsOpen={vi.fn()} onFeedbackClick={onFeedbackClick} />
    </MemoryRouter>
  );
};

describe("SNB 컴포넌트", () => {
  it("사이드바 맨 하단에 의견 보내기 트리거가 있어야 한다", () => {
    renderSNB();

    expect(screen.getByText("의견 보내기")).toBeInTheDocument();
  });

  it("의견 보내기 트리거를 클릭하면 onFeedbackClick이 호출되어야 한다", async () => {
    const onFeedbackClick = vi.fn();
    const user = setupUser();
    renderSNB(onFeedbackClick);

    await user.click(screen.getByText("의견 보내기"));

    expect(onFeedbackClick).toHaveBeenCalledTimes(1);
  });
});
