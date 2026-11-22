import { Platform } from "react-native";
import {
  deepLinkToSubscriptions,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  getPendingTransactionsIOS,
  initConnection,
  isEligibleForIntroOfferIOS,
  isUserCancelledError,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Purchase,
  type PurchaseAndroid,
} from "expo-iap";
import { APPLE_PRODUCTS, GOOGLE_PRODUCT, isOurProduct, pickGoogleOffer } from "./products";

/** 스토어 거래를 서버 검증에 필요한 만큼만 추린 모양. raw는 finish 때 라이브러리에 그대로 돌려준다. */
export interface StorePurchase {
  platform: "ios" | "android";
  productId: string;
  /** iOS: StoreKit 2 거래 JWS, Android: purchaseToken */
  proof: string;
  raw: unknown;
}

/** expo-iap를 감싼 얇은 경계. 라이브러리 API는 이 파일에서만 쓰고, 테스트는 이 인터페이스를 mock한다. */
export interface PurchaseClient {
  /** 결제창을 연다. 결과는 onPurchase로 온다. 사용자 취소는 정상 종료(이벤트 없음)다. */
  buy(opts: { withTrial: boolean; accountToken: string }): Promise<void>;
  /** 아직 끝내지(finish) 않은 거래. iOS는 StoreKit 미완료 거래, Android는 승인 전 구매. */
  listUnfinished(): Promise<StorePurchase[]>;
  /** 스토어가 지금 이 사용자 것으로 보는 구매(복원용). iOS는 App Store 동기화를 먼저 한다. */
  listAvailable(): Promise<StorePurchase[]>;
  finish(p: StorePurchase): Promise<void>;
  /** 스토어 기준 체험(소개 혜택) 자격. 계정 기준(trialUsedAt)은 따로 본다. */
  isTrialEligible(): Promise<boolean>;
  openManageSubscriptions(): Promise<void>;
  onPurchase(cb: (p: StorePurchase) => void, onError: (e: unknown) => void): () => void;
}

const platform = (): "ios" | "android" => (Platform.OS === "ios" ? "ios" : "android");

// 스토어 연결은 앱 생명주기 동안 한 번만 연다. 실패하면 다음 호출이 다시 시도하도록 비운다.
let connection: Promise<unknown> | null = null;
const ensureConnected = (): Promise<unknown> => {
  connection ??= initConnection().catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
};

/** iOS purchaseToken은 StoreKit 2 jwsRepresentation, Android는 Play purchaseToken이다(라이브러리 통합 필드). */
const toStorePurchase = (purchase: Purchase): StorePurchase | null => {
  if (!isOurProduct(purchase.productId)) return null;
  const proof = purchase.purchaseToken;
  if (!proof) {
    console.warn("[iap] 거래에 검증용 토큰이 없음 — 건너뜀:", purchase.productId);
    return null;
  }
  return { platform: platform(), productId: purchase.productId, proof, raw: purchase };
};

const toStorePurchases = (purchases: readonly Purchase[]): StorePurchase[] =>
  purchases.map(toStorePurchase).filter((p): p is StorePurchase => p !== null);

const fetchSubscription = async (sku: string) => {
  await ensureConnected();
  const products = (await fetchProducts({ skus: [sku], type: "subs" })) ?? [];
  return products.find((p) => p.id === sku) ?? null;
};

const googleOfferToken = async (withTrial: boolean): Promise<string | null> => {
  const product = await fetchSubscription(GOOGLE_PRODUCT.productId);
  if (!product || product.platform !== "android" || product.type !== "subs") return null;
  return pickGoogleOffer(product.subscriptionOffers, withTrial);
};

/**
 * 스토어 결제창을 연다. 사용자가 취소하면 라이브러리가 requestPurchase를 거절로 끝내는데, 이건 오류가 아니라
 * "아무 일도 없었음"이라 정상 종료로 바꾼다(그대로 두면 화면에 네트워크 오류로 보인다). 다른 거절은 그대로 던진다.
 */
const requestCancellable = async (request: () => Promise<unknown>): Promise<void> => {
  try {
    await request();
  } catch (error) {
    if (isUserCancelledError(error)) return;
    throw error;
  }
};

export const purchaseClient: PurchaseClient = {
  async buy({ withTrial, accountToken }) {
    await ensureConnected();
    if (platform() === "ios") {
      await requestCancellable(() =>
        requestPurchase({
          type: "subs",
          request: { apple: { sku: withTrial ? APPLE_PRODUCTS.trial : APPLE_PRODUCTS.plain, appAccountToken: accountToken } },
        }),
      );
      return;
    }
    const offerToken = await googleOfferToken(withTrial);
    if (!offerToken) throw new Error(`Google 구독 offer를 찾지 못함 (withTrial=${withTrial})`);
    await requestCancellable(() =>
      requestPurchase({
        type: "subs",
        request: {
          google: {
            skus: [GOOGLE_PRODUCT.productId],
            subscriptionOffers: [{ sku: GOOGLE_PRODUCT.productId, offerToken }],
            obfuscatedAccountId: accountToken,
          },
        },
      }),
    );
  },

  async listUnfinished() {
    await ensureConnected();
    if (platform() === "ios") return toStorePurchases(await getPendingTransactionsIOS());
    // Android는 "끝냄" = 승인(acknowledge)이다. 승인 안 된 구매는 3일 안에 끝내지 않으면 자동 환불된다.
    const purchases = await getAvailablePurchases();
    return toStorePurchases(purchases.filter((p) => (p as PurchaseAndroid).isAcknowledgedAndroid !== true));
  },

  async listAvailable() {
    await ensureConnected();
    // 사용자가 누른 복원에서만 부른다 — iOS는 App Store 동기화(로그인 요청이 뜰 수 있음)를 먼저 한다.
    await restorePurchases();
    return toStorePurchases(await getAvailablePurchases());
  },

  async finish(p) {
    const purchase = p.raw as Purchase;
    if (p.platform === "android") {
      // Android 승인은 서버가 verify에서 이미 한다(스펙 8절). 앱 쪽 승인은 보조라 실패해도 거래는 끝난 것으로 본다.
      if ((purchase as PurchaseAndroid).isAcknowledgedAndroid === true) return;
      try {
        await finishTransaction({ purchase, isConsumable: false });
      } catch (error) {
        // 서버가 이미 승인했으므로 무해하다 — 예상된 실패라 Sentry로 보내지 않는다.
        console.warn("[iap] Android 승인 실패(서버가 승인함):", error);
      }
      return;
    }
    await finishTransaction({ purchase, isConsumable: false });
  },

  async isTrialEligible() {
    if (platform() === "android") return (await googleOfferToken(true)) !== null;
    const product = await fetchSubscription(APPLE_PRODUCTS.trial);
    const groupId = product?.platform === "ios" && product.type === "subs" ? product.subscriptionGroupIdIOS : null;
    if (!groupId) return false;
    return isEligibleForIntroOfferIOS(groupId);
  },

  async openManageSubscriptions() {
    await deepLinkToSubscriptions({ packageNameAndroid: "com.swimmingriver.tododo", skuAndroid: GOOGLE_PRODUCT.productId });
  },

  onPurchase(cb, onError) {
    const updated = purchaseUpdatedListener((purchase) => {
      const p = toStorePurchase(purchase);
      if (p) cb(p);
    });
    const failed = purchaseErrorListener((error) => onError(error));
    // iOS는 연결이 열려야 미완료·갱신 거래(Transaction.updates)가 리스너로 온다.
    ensureConnected().catch(onError);
    return () => {
      updated.remove();
      failed.remove();
    };
  },
};
