/**
 * Apple 환불 요청(CONSUMPTION_REQUEST)에 보낼 "환불 선호" 결정과 회신 본문.
 * App Store 환불은 Apple이 결정하지만, 우리 기준(결제일 14일 이내 전액 환불 — 웹·Google과 같음, 스펙 11절)을
 * 선호로 전달해 Apple 판단을 같은 기준에 가깝게 맞춘다.
 *
 * 본문 형식은 App Store Server API "Send Consumption Information"(v2, ConsumptionRequest) 문서 기준(2026-11-19 확인):
 * - https://developer.apple.com/documentation/appstoreserverapi/send-consumption-information
 *   PUT /inApps/v2/transactions/consumption/{transactionId}
 * - https://developer.apple.com/documentation/appstoreserverapi/consumptionrequest
 *   필수: customerConsented(true가 아니면 400 InvalidCustomerConsentedError), deliveryStatus, sampleContentProvided
 *   선택: refundPreference(GRANT_FULL | GRANT_PRORATED | DECLINE), consumptionPercentage
 * v1에 있던 playTime·lifetimeDollars*·userStatus·accountTenure·appAccountToken 등은 v2 본문에 없다 —
 * 그래서 "모름" 값으로 채울 필드도 없다.
 */

export const REFUND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type RefundPreference = "grant" | "decline";

/** 경계: 정확히 14일이면 아직 기간 안(grant). 구매일이 지금보다 뒤(시계 오차)여도 grant. */
export const decideRefundPreference = (purchaseDateMs: number, nowMs: number): RefundPreference =>
  nowMs - purchaseDateMs <= REFUND_WINDOW_MS ? "grant" : "decline";

export interface ConsumptionRequestBody {
  customerConsented: true;
  deliveryStatus: "DELIVERED";
  sampleContentProvided: boolean;
  refundPreference: "GRANT_FULL" | "DECLINE";
}

export const buildConsumptionBody = (pref: RefundPreference): ConsumptionRequestBody => ({
  // 고객 동의가 없으면 회신 자체를 하지 말라는 것이 Apple 지침이다. 이 본문은 동의 고지 후(플래그 켬)에만 보낸다.
  customerConsented: true,
  // 구독 권한은 결제 즉시 서버가 반영한다(전달 실패를 따로 추적하지 않음).
  deliveryStatus: "DELIVERED",
  // 구매 전 무료로 쓸 수 있는 기본 기능과 프리미엄 기능 설명(그리고 체험 상품)을 제공한다.
  sampleContentProvided: true,
  // GRANT_PRORATED는 쓰지 않는다(우리 기준은 전액 또는 없음). consumptionPercentage는 자동 갱신 구독이라 Apple이 계산하므로 생략.
  refundPreference: pref === "grant" ? "GRANT_FULL" : "DECLINE",
});
