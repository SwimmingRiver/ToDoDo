/** 스토어에 등록한 상품 id. 서버(billing-proxy)와 스토어 콘솔 설정과 같아야 한다. */
export const APPLE_PRODUCTS = { trial: "premium_monthly_trial", plain: "premium_monthly" } as const;
export const GOOGLE_PRODUCT = { productId: "premium_monthly", basePlanId: "monthly", trialOfferId: "free-trial-7d" } as const;

/** 우리 구독 상품인지. 다른 상품 거래를 서버로 보내 봐야 거절만 된다. */
export const isOurProduct = (productId: string): boolean =>
  productId === APPLE_PRODUCTS.trial || productId === APPLE_PRODUCTS.plain || productId === GOOGLE_PRODUCT.productId;

interface GoogleOfferLike {
  id: string;
  basePlanIdAndroid?: string | null;
  offerTokenAndroid?: string | null;
}

/**
 * monthly 기본 요금제에서 살 offer의 토큰을 고른다. 체험이면 free-trial-7d offer, 아니면 기본 요금제 자체
 * (offer id가 없는 것 — 라이브러리는 이때 id를 기본 요금제 id로 채운다). Play는 사용자에게 자격이 있는
 * offer만 돌려주므로 체험 offer가 없으면 체험 자격이 없는 것이다.
 */
export const pickGoogleOffer = (offers: readonly GoogleOfferLike[], withTrial: boolean): string | null => {
  const monthly = offers.filter((o) => o.basePlanIdAndroid === GOOGLE_PRODUCT.basePlanId && o.offerTokenAndroid);
  const chosen = withTrial
    ? monthly.find((o) => o.id === GOOGLE_PRODUCT.trialOfferId)
    : (monthly.find((o) => o.id === GOOGLE_PRODUCT.basePlanId) ?? monthly.find((o) => o.id !== GOOGLE_PRODUCT.trialOfferId));
  return chosen?.offerTokenAndroid ?? null;
};
