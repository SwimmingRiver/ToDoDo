import { AccountDataStore } from "./accountDataStore";
import { verifyAppleJws } from "./apple/jws";
import { APPLE_ROOT_CA_G3_DER } from "./apple/rootCa";
import { AppleServerApi } from "./apple/serverApi";
import { ClaimsClient } from "./claims";
import { EntitlementStore } from "./entitlementStore";
import type { Env } from "./env";
import { GoogleTokenProvider, parseServiceAccount } from "./googleAuth";
import { PaddleClient } from "./paddle";
import { handleRequest, type BillingDeps } from "./router";
import { StoreLinkStore } from "./storeLinks";

// 같은 isolate 안에서는 Google 액세스 토큰 캐시를 재사용한다.
let cached: { env: Env; deps: BillingDeps } | null = null;

const getDeps = (env: Env): BillingDeps => {
  if (cached?.env === env) return cached.deps;
  const tokens = new GoogleTokenProvider(parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT));
  const getToken = () => tokens.getToken();
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
  };
  cached = { env, deps };
  return deps;
};

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handleRequest(request, env, () => getDeps(env)),
};
