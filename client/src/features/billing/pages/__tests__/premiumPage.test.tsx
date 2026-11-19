import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DEFAULT_ENTITLEMENT, type Entitlement } from "@/features/entitlement/types";

let entitlement: Entitlement | undefined = DEFAULT_ENTITLEMENT;
vi.mock("@/features/entitlement/hooks/useEntitlement", () => ({
  useEntitlement: () => ({ data: entitlement, isLoading: entitlement === undefined }),
}));

const checkout = { phase: "idle" as string, start: vi.fn() };
const trial = { mutate: vi.fn(), isPending: false };
const portal = { mutate: vi.fn(), isPending: false };
vi.mock("../../hooks", () => ({
  useCheckout: () => checkout,
  useStartTrial: () => trial,
  useOpenPortal: () => portal,
}));

import PremiumPage from "../premiumPage";

const NOW = new Date("2026-10-10T00:00:00.000Z");
const set = (overrides: Partial<Entitlement>) => {
  entitlement = { ...DEFAULT_ENTITLEMENT, ...overrides };
};

const rec = {
  status: "active" as const,
  premiumUntil: "2026-11-13T00:00:00.000Z",
  cancelAt: null,
  currentPeriodEnd: null,
  autoRenew: true,
  startedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

describe("PremiumPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    entitlement = DEFAULT_ENTITLEMENT;
    checkout.phase = "idle";
  });
  afterEach(() => vi.useRealTimers());

  it("체험 전: 혜택·가격·체험(주)·바로 구독(보조)", () => {
    render(<PremiumPage />);
    expect(screen.getByText("AI 할 일 플랜")).toBeInTheDocument();
    expect(screen.getByText("월 4,900원")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "7일 무료 체험" }));
    expect(trial.mutate).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "바로 구독하기" }));
    expect(checkout.start).toHaveBeenCalled();
  });

  it("체험을 썼으면 체험 버튼이 없다", () => {
    set({ trialUsedAt: "2026-09-01T00:00:00.000Z" });
    render(<PremiumPage />);
    expect(screen.queryByRole("button", { name: "7일 무료 체험" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "구독하기" })).toBeInTheDocument();
  });

  it("체험 중: 남은 일수와 구독하기", () => {
    set({ status: "trialing", trialUsedAt: "2026-10-09T00:00:00.000Z", premiumUntil: "2026-10-16T00:00:00.000Z" });
    render(<PremiumPage />);
    expect(screen.getByText(/6일 남음/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "구독하기" })).toBeInTheDocument();
  });

  it("구독 중: 다음 결제일과 구독 관리", () => {
    set({
      status: "active",
      source: "paddle",
      premiumUntil: "2026-11-13T00:00:00.000Z",
      currentPeriodEnd: "2026-11-10T00:00:00.000Z",
      sources: { paddle: { ...rec, customerId: "ctm_1", subscriptionId: "sub_1", lastWebhookEventId: null, lastEventOccurredAt: null } },
    });
    render(<PremiumPage />);
    expect(screen.getByText(/다음 결제일/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "구독 관리" }));
    expect(portal.mutate).toHaveBeenCalled();
  });

  it("해지 예약: 이용 가능 기한", () => {
    set({ status: "active", premiumUntil: "2026-11-10T00:00:00.000Z", cancelAt: "2026-11-10T00:00:00.000Z", customerId: "ctm_1" });
    render(<PremiumPage />);
    expect(screen.getByText(/까지 이용 가능/)).toBeInTheDocument();
  });

  it("결제 실패: 경고와 결제 수단 변경", () => {
    set({ status: "past_due", premiumUntil: "2026-11-13T00:00:00.000Z", customerId: "ctm_1" });
    render(<PremiumPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("결제에 실패했어요");
    fireEvent.click(screen.getByRole("button", { name: "결제 수단 변경" }));
    expect(portal.mutate).toHaveBeenCalled();
  });

  it("결제 확인 중에는 버튼이 비활성이고 안내를 보여준다", () => {
    checkout.phase = "confirming";
    render(<PremiumPage />);
    expect(screen.getByText("결제 확인 중…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "바로 구독하기" })).toBeDisabled();
  });

  it("오래 걸리면 완료 안내로 바뀐다", () => {
    checkout.phase = "slow";
    render(<PremiumPage />);
    expect(screen.getByText(/결제는 완료됐어요/)).toBeInTheDocument();
  });

  it("대표 출처 apple: App Store 안내만 있고 구독하기·구독 관리 버튼이 없다", () => {
    set({ status: "active", source: "apple", premiumUntil: "2026-11-13T00:00:00.000Z" });
    render(<PremiumPage />);
    expect(screen.getByText("App Store에서 구독 중이에요. 구독 관리는 App Store에서 할 수 있어요")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("대표 출처 google: Google Play 문구", () => {
    set({ status: "active", source: "google", premiumUntil: "2026-11-13T00:00:00.000Z" });
    render(<PremiumPage />);
    expect(screen.getByText("Google Play에서 구독 중이에요. 구독 관리는 Google Play에서 할 수 있어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /구독/ })).not.toBeInTheDocument();
  });

  it("이중 구독이면 페이지 상단에 배너를 보여주고 paddle이면 포털 버튼이 열린다", () => {
    set({
      status: "active",
      source: "apple",
      premiumUntil: "2026-11-13T00:00:00.000Z",
      duplicate: { laterSource: "paddle", detectedAt: "2026-10-09T00:00:00.000Z" },
    });
    render(<PremiumPage />);
    expect(screen.getByText(/나중에 시작한 웹 구독을 해지해 주세요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "구독 관리" }));
    expect(portal.mutate).toHaveBeenCalled();
  });

  it("duplicate가 없으면 배너가 없다", () => {
    set({ status: "active", source: "apple", premiumUntil: "2026-11-13T00:00:00.000Z" });
    render(<PremiumPage />);
    expect(screen.queryByText(/두 군데서 결제/)).not.toBeInTheDocument();
  });
});
