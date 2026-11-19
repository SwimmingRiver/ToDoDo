import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DuplicateSubscriptionBanner from "../duplicateSubscriptionBanner";

const duplicate = (laterSource: "paddle" | "apple" | "google") => ({ laterSource, detectedAt: "2026-10-09T00:00:00.000Z" });

describe("DuplicateSubscriptionBanner", () => {
  it("laterSource paddle: 웹 구독 해지 안내와 구독 관리 버튼", () => {
    const onManage = vi.fn();
    render(<DuplicateSubscriptionBanner duplicate={duplicate("paddle")} onManage={onManage} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "구독이 두 군데서 결제되고 있어요. 나중에 시작한 웹 구독을 해지해 주세요",
    );
    fireEvent.click(screen.getByRole("button", { name: "구독 관리" }));
    expect(onManage).toHaveBeenCalled();
  });

  it("laterSource apple: App Store 문구, 버튼 없음", () => {
    render(<DuplicateSubscriptionBanner duplicate={duplicate("apple")} onManage={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "구독이 두 군데서 결제되고 있어요. 나중에 시작한 App Store 구독을 해지해 주세요",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("laterSource google: Google Play 문구", () => {
    render(<DuplicateSubscriptionBanner duplicate={duplicate("google")} onManage={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("나중에 시작한 Google Play 구독을 해지해 주세요");
  });

  it("duplicate가 null이면 렌더하지 않는다", () => {
    const { container } = render(<DuplicateSubscriptionBanner duplicate={null} onManage={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
