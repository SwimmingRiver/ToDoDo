import { fireEvent, render, screen, waitFor, act } from "@testing-library/react-native";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Linking } from "react-native";
import { EMPTY_ENTITLEMENT, type EntitlementDoc } from "@tododo/core/dist/entitlement/index.js";

let mockDoc: EntitlementDoc | undefined = EMPTY_ENTITLEMENT;
let mockLoading = false;
jest.mock("../useEntitlement", () => ({ useEntitlement: () => ({ data: mockDoc, isLoading: mockLoading }) }));

const mockBuy = jest.fn<(w: boolean) => Promise<void>>();
const mockRestore = jest.fn<() => Promise<{ restored: number; failure: string | null }>>();
let mockLastError: string | null = null;
jest.mock("../iap/usePurchase", () => ({
  usePurchase: () => ({ buy: mockBuy, restore: mockRestore, phase: "idle", lastError: mockLastError }),
}));

const mockTrial = jest.fn<() => Promise<boolean>>();
const mockManage = jest.fn<() => Promise<void>>();
jest.mock("../iap/purchaseClient", () => ({
  purchaseClient: { isTrialEligible: () => mockTrial(), openManageSubscriptions: () => mockManage() },
}));

import { PremiumSection } from "../PremiumSection";

const FUTURE = "2026-12-19T12:00:00.000Z"; // 한낮 UTC — 어느 TZ에서도 같은 날짜
const mk = (over: Partial<EntitlementDoc>): EntitlementDoc => ({ ...EMPTY_ENTITLEMENT, plan: "premium", status: "active", premiumUntil: FUTURE, ...over });
const flush = () => act(async () => {});

describe("PremiumSection", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] }).setSystemTime(Date.parse("2026-11-19T00:00:00Z"));
    mockDoc = EMPTY_ENTITLEMENT;
    mockLastError = null;
    mockLoading = false;
    mockBuy.mockReset().mockResolvedValue(undefined);
    mockRestore.mockReset().mockResolvedValue({ restored: 0, failure: null });
    mockTrial.mockReset().mockResolvedValue(true);
    mockManage.mockReset().mockResolvedValue(undefined);
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
  });

  it("offer view renders restore, legal links and auto-renew disclosure", async () => {
    await render(<PremiumSection />);
    await flush();
    expect(screen.getByText(/월 4,900원, 1개월마다 자동 갱신돼요\. 현재 기간이 끝나기 24시간 전까지 해지하지 않으면 다음 기간 요금이 청구돼요\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "구매 복원" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "이용약관" }));
    expect(Linking.openURL).toHaveBeenCalledWith("https://tododo-app.com/terms");
    await fireEvent.press(screen.getByRole("button", { name: "개인정보처리방침" }));
    expect(Linking.openURL).toHaveBeenCalledWith("https://tododo-app.com/privacy");
  });

  it("loading entitlement → no buy button", async () => {
    mockLoading = true;
    await render(<PremiumSection />);
    await flush();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("trial disclosure shown only when withTrial", async () => {
    const text = "7일 무료 체험이 끝나면 월 4,900원이 자동으로 결제돼요. 체험이 끝나기 24시간 전까지 해지하면 요금이 청구되지 않아요.";
    await render(<PremiumSection />);
    await flush();
    expect(screen.getByText(text)).toBeTruthy();
  });

  it("no trial disclosure when not eligible", async () => {
    mockTrial.mockResolvedValue(false);
    await render(<PremiumSection />);
    await flush();
    expect(screen.queryByText(/7일 무료 체험이 끝나면/)).toBeNull();
  });

  it("buy button disabled until trial eligibility resolves", async () => {
    mockTrial.mockReturnValue(new Promise(() => {}));
    await render(<PremiumSection />);
    await flush();
    await fireEvent.press(screen.getByRole("button", { name: "프리미엄 시작하기" }));
    expect(mockBuy).not.toHaveBeenCalled();
  });

  it.each([
    ["LINKED_TO_OTHER_ACCOUNT", "이 구독은 다른 계정에서 사용 중이에요"],
    ["ALREADY_SUBSCRIBED", "이미 구독 중인 다른 Google Play 구독이 있어요. 새 결제는 승인되지 않아 자동으로 환불돼요"],
    ["PENDING", "결제가 승인되면 프리미엄이 켜져요"],
    ["INVALID", "구매를 확인하지 못했어요. 잠시 후 다시 시도해 주세요"],
    ["NETWORK", "네트워크 문제로 구매 확인이 늦어지고 있어요. 앱을 다시 열면 이어서 확인해요"],
  ])("error %s shows its copy", async (reason, text) => {
    mockLastError = reason;
    await render(<PremiumSection />);
    await flush();
    expect(screen.getByText(text)).toBeTruthy();
  });

  it("restore failure from onRestore shows its error copy", async () => {
    mockRestore.mockResolvedValue({ restored: 0, failure: "INVALID" });
    await render(<PremiumSection />);
    await flush();
    await fireEvent.press(screen.getByRole("button", { name: "구매 복원" }));
    await waitFor(() => expect(screen.getByText("구매를 확인하지 못했어요. 잠시 후 다시 시도해 주세요")).toBeTruthy());
    expect(screen.queryByText("복원할 구매가 없어요")).toBeNull();
  });

  it("manual source → granted copy, no buttons", async () => {
    mockDoc = mk({ source: "manual" });
    await render(<PremiumSection />);
    await flush();
    expect(screen.getByText(/프리미엄 이용 중이에요\. 2026년 12월 19일까지 이용할 수 있어요/)).toBeTruthy();
    expect(screen.queryByText(/웹에서 관리/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("store view with null until renders no date fragment", async () => {
    mockDoc = mk({ source: "google", cancelAt: FUTURE, premiumUntil: null });
    await render(<PremiumSection />);
    await flush();
    expect(screen.queryByText(/에 구독이 종료돼요/)).toBeNull();
  });

  it("buys with trial when eligible", async () => {
    await render(<PremiumSection />);
    await flush();
    await fireEvent.press(screen.getByRole("button", { name: "7일 무료로 시작하기" }));
    expect(mockBuy).toHaveBeenCalledWith(true);
  });

  it("buys without trial when not store-eligible", async () => {
    mockTrial.mockResolvedValue(false);
    await render(<PremiumSection />);
    await flush();
    await fireEvent.press(screen.getByRole("button", { name: "프리미엄 시작하기" }));
    expect(mockBuy).toHaveBeenCalledWith(false);
  });

  it("LINKED_TO_OTHER_ACCOUNT error shows message", async () => {
    mockLastError = "LINKED_TO_OTHER_ACCOUNT";
    await render(<PremiumSection />);
    await flush();
    expect(screen.getByText("이 구독은 다른 계정에서 사용 중이에요")).toBeTruthy();
  });

  it("restore with nothing / something shows result text", async () => {
    await render(<PremiumSection />);
    await flush();
    await fireEvent.press(screen.getByRole("button", { name: "구매 복원" }));
    await waitFor(() => expect(screen.getByText("복원할 구매가 없어요")).toBeTruthy());
    mockRestore.mockResolvedValue({ restored: 1, failure: null });
    await fireEvent.press(screen.getByRole("button", { name: "구매 복원" }));
    await waitFor(() => expect(screen.getByText("구매를 복원했어요")).toBeTruthy());
  });

  it("paddle representative → external text, no buttons or links", async () => {
    mockDoc = mk({ source: "paddle" });
    await render(<PremiumSection />);
    await flush();
    expect(screen.getByText(/다른 기기나 웹에서 관리할 수 있어요/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("store view shows 구독 관리 that opens the store", async () => {
    mockDoc = mk({ source: "apple" });
    await render(<PremiumSection />);
    await flush();
    await fireEvent.press(screen.getByRole("button", { name: "구독 관리" }));
    expect(mockManage).toHaveBeenCalled();
  });

  it("canceling store view shows end date", async () => {
    mockDoc = mk({ source: "google", cancelAt: FUTURE });
    await render(<PremiumSection />);
    await flush();
    expect(screen.getByText(/2026년 12월 19일.*종료/)).toBeTruthy();
  });

  it("pastDue store → payment check copy + manage", async () => {
    mockDoc = mk({ source: "apple", status: "past_due" });
    await render(<PremiumSection />);
    await flush();
    expect(screen.getByText(/결제 수단을 확인해 주세요/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "구독 관리" }));
    expect(mockManage).toHaveBeenCalled();
  });

  it("스토어 결제 재시도(프리미엄 아님) → 구매 권유 대신 결제 수단 확인 + 관리", async () => {
    const nowIso = "2026-11-19T00:00:00.000Z";
    mockDoc = {
      ...EMPTY_ENTITLEMENT,
      status: "past_due",
      source: "apple",
      premiumUntil: nowIso,
      sources: {
        apple: {
          status: "past_due",
          premiumUntil: nowIso,
          cancelAt: null,
          currentPeriodEnd: nowIso,
          autoRenew: true,
          startedAt: "2026-10-01T00:00:00.000Z",
          updatedAt: nowIso,
          originalTransactionId: "otx_1",
          productId: "premium_monthly",
          environment: "Production",
          appAccountToken: null,
          lastNotificationUUID: null,
          lastSignedDate: null,
        },
      },
    };
    await render(<PremiumSection />);
    await flush();
    expect(screen.getByText(/결제 수단을 확인해 주세요/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /시작하기/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "구독 관리" }));
    expect(mockManage).toHaveBeenCalled();
  });

  it("duplicate later apple on ios → banner with manage", async () => {
    mockDoc = mk({ source: "paddle", duplicate: { laterSource: "apple", detectedAt: "2026-11-19T00:00:00.000Z" } });
    await render(<PremiumSection />);
    await flush();
    expect(screen.getByText("구독이 두 군데서 결제되고 있어요. 나중에 시작한 App Store 구독을 해지해 주세요")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "구독 관리" }));
    expect(mockManage).toHaveBeenCalled();
  });
});
