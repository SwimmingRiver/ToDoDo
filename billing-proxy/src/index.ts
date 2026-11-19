import { buildDeps } from "./deps";
import type { Env } from "./env";
import { handleRequest, type BillingDeps } from "./router";

// 같은 isolate 안에서는 Google 액세스 토큰 캐시를 재사용한다.
let cached: { env: Env; deps: BillingDeps } | null = null;

const getDeps = (env: Env): BillingDeps => {
  if (cached?.env === env) return cached.deps;
  const deps = buildDeps(env);
  cached = { env, deps };
  return deps;
};

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handleRequest(request, env, () => getDeps(env)),
};
