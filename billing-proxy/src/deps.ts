import { AccountDataStore } from "./accountDataStore";
import { verifyAppleJws } from "./apple/jws";
import { APPLE_ROOT_CA_G3_DER } from "./apple/rootCa";
import { AppleServerApi } from "./apple/serverApi";
import { ClaimsClient } from "./claims";
import { EntitlementStore } from "./entitlementStore";
import type { Env } from "./env";
import { verifyPubSubPushToken } from "./google/oidc";
import { PlayApi } from "./google/playApi";
import { GoogleTokenProvider, parseServiceAccount } from "./googleAuth";
import { PaddleClient } from "./paddle";
import type { BillingDeps } from "./router";
import { StoreLinkStore } from "./storeLinks";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

/** 스토어 시크릿이 비어 있으면 그 스토어 경로만 실패시킨다(호출 시점에 던짐 → 라우터의 500). */
const requireStoreSecret = (value: string | undefined, name: string): string => {
  if (!value) throw new Error(`${name}이(가) 설정되지 않았습니다(스토어 계정 준비 전)`);
  return value;
};

export const buildDeps = (env: Env): BillingDeps => {
  const tokens = new GoogleTokenProvider(parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT));
  const getToken = () => tokens.getToken();
  // Play Developer API는 Firestore·Auth와 다른 서비스 계정·스코프를 쓴다(권한 분리).
  // 스토어 시크릿은 처음 쓸 때 읽는다 — 스토어 계정이 준비되기 전 릴리스에서 시크릿이 비어 있어도
  // Paddle·체험·탈퇴 경로는 살아 있어야 하고, 실패는 스토어 경로의 500으로만 남아야 한다.
  let playTokens: GoogleTokenProvider | null = null;
  const getPlayToken = async (): Promise<string> => {
    playTokens ??= new GoogleTokenProvider(
      parseServiceAccount(requireStoreSecret(env.GOOGLE_PLAY_SERVICE_ACCOUNT, "GOOGLE_PLAY_SERVICE_ACCOUNT")),
      undefined,
      undefined,
      ANDROID_PUBLISHER_SCOPE,
    );
    return playTokens.getToken();
  };
  // now는 호출마다 새로 잡는다 — deps가 isolate 동안 캐시되므로 생성 시각으로 고정하면 인증서 기간 판정이 낡는다.
  const verify = (jws: string) => verifyAppleJws<unknown>(jws, { trustedRootsDer: [APPLE_ROOT_CA_G3_DER], now: new Date() });
  let apple: AppleServerApi | null = null;
  const getApple = (): AppleServerApi =>
    (apple ??= new AppleServerApi(
      {
        bundleId: env.APPLE_BUNDLE_ID,
        issuerId: requireStoreSecret(env.APPLE_ISSUER_ID, "APPLE_ISSUER_ID"),
        keyId: requireStoreSecret(env.APPLE_KEY_ID, "APPLE_KEY_ID"),
        privateKeyPem: requireStoreSecret(env.APPLE_PRIVATE_KEY, "APPLE_PRIVATE_KEY"),
      },
      verify,
    ));
  const deps: BillingDeps = {
    store: new EntitlementStore(env.FIREBASE_PROJECT_ID, getToken),
    claims: new ClaimsClient(env.FIREBASE_PROJECT_ID, getToken),
    paddle: new PaddleClient(env.PADDLE_API_BASE, env.PADDLE_API_KEY, env.PADDLE_PRICE_ID, env.BILLING_UID_SECRET),
    accountData: new AccountDataStore(env.FIREBASE_PROJECT_ID, getToken),
    storeLinks: new StoreLinkStore(env.FIREBASE_PROJECT_ID, getToken),
    apple: { getSubscriptionSnapshot: async (transactionId) => getApple().getSubscriptionSnapshot(transactionId) },
    verifyAppleJws: verify,
    play: new PlayApi(env.GOOGLE_PLAY_PACKAGE_NAME, getPlayToken),
    // Apple과 같은 이유로 now는 호출마다 새로 잡는다(토큰 만료 판정).
    // 설정이 없으면 401이 아니라 500 — Pub/Sub이 재전송해 설정 후에 반영된다.
    verifyPubSub: async (authHeader) =>
      verifyPubSubPushToken(authHeader, {
        audience: requireStoreSecret(env.GOOGLE_PUBSUB_AUDIENCE, "GOOGLE_PUBSUB_AUDIENCE"),
        email: requireStoreSecret(env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL, "GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL"),
        now: new Date(),
      }),
  };
  return deps;
};

