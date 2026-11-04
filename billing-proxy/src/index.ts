import { AccountDataStore } from "./accountDataStore";
import { ClaimsClient } from "./claims";
import { EntitlementStore } from "./entitlementStore";
import type { Env } from "./env";
import { GoogleTokenProvider, parseServiceAccount } from "./googleAuth";
import { PaddleClient } from "./paddle";
import { handleRequest, type BillingDeps } from "./router";

// 같은 isolate 안에서는 Google 액세스 토큰 캐시를 재사용한다.
let cached: { env: Env; deps: BillingDeps } | null = null;

const getDeps = (env: Env): BillingDeps => {
  if (cached?.env === env) return cached.deps;
  const tokens = new GoogleTokenProvider(parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT));
  const getToken = () => tokens.getToken();
  const deps: BillingDeps = {
    store: new EntitlementStore(env.FIREBASE_PROJECT_ID, getToken),
    claims: new ClaimsClient(env.FIREBASE_PROJECT_ID, getToken),
    paddle: new PaddleClient(env.PADDLE_API_BASE, env.PADDLE_API_KEY, env.PADDLE_PRICE_ID, env.BILLING_UID_SECRET),
    accountData: new AccountDataStore(env.FIREBASE_PROJECT_ID, getToken),
  };
  cached = { env, deps };
  return deps;
};

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handleRequest(request, env, () => getDeps(env)),
};
