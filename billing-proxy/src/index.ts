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
import { handleRequest, type BillingDeps } from "./router";
import { StoreLinkStore } from "./storeLinks";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

// 같은 isolate 안에서는 Google 액세스 토큰 캐시를 재사용한다.
let cached: { env: Env; deps: BillingDeps } | null = null;

const getDeps = (env: Env): BillingDeps => {
  if (cached?.env === env) return cached.deps;
  const tokens = new GoogleTokenProvider(parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT));
  const getToken = () => tokens.getToken();
  // Play Developer API는 Firestore·Auth와 다른 서비스 계정·스코프를 쓴다(권한 분리).
  const playTokens = new GoogleTokenProvider(
    parseServiceAccount(env.GOOGLE_PLAY_SERVICE_ACCOUNT),
    undefined,
    undefined,
    ANDROID_PUBLISHER_SCOPE,
  );
  // now는 호출마다 새로 잡는다 — deps가 isolate 동안 캐시되므로 생성 시각으로 고정하면 인증서 기간 판정이 낡는다.
  const verify = (jws: string) => verifyAppleJws<unknown>(jws, { trustedRootsDer: [APPLE_ROOT_CA_G3_DER], now: new Date() });
  const deps: BillingDeps = {
    store: new EntitlementStore(env.FIREBASE_PROJECT_ID, getToken),
    claims: new ClaimsClient(env.FIREBASE_PROJECT_ID, getToken),
    paddle: new PaddleClient(env.PADDLE_API_BASE, env.PADDLE_API_KEY, env.PADDLE_PRICE_ID, env.BILLING_UID_SECRET),
    accountData: new AccountDataStore(env.FIREBASE_PROJECT_ID, getToken),
    storeLinks: new StoreLinkStore(env.FIREBASE_PROJECT_ID, getToken),
    apple: new AppleServerApi(
      {
        bundleId: env.APPLE_BUNDLE_ID,
        issuerId: env.APPLE_ISSUER_ID,
        keyId: env.APPLE_KEY_ID,
        privateKeyPem: env.APPLE_PRIVATE_KEY,
      },
      verify,
    ),
    verifyAppleJws: verify,
    play: new PlayApi(env.GOOGLE_PLAY_PACKAGE_NAME, () => playTokens.getToken()),
    // Apple과 같은 이유로 now는 호출마다 새로 잡는다(토큰 만료 판정).
    verifyPubSub: (authHeader) =>
      verifyPubSubPushToken(authHeader, {
        audience: env.GOOGLE_PUBSUB_AUDIENCE,
        email: env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL,
        now: new Date(),
      }),
  };
  cached = { env, deps };
  return deps;
};

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handleRequest(request, env, () => getDeps(env)),
};
