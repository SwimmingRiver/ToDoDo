import { deriveAccountToken } from "../accountToken";
import type { Env } from "../env";

/** 앱이 구매 때 스토어에 넘길 계정 토큰(Apple appAccountToken·Google obfuscatedAccountId)을 돌려준다. */
export const handleAccountToken = async (uid: string, env: Pick<Env, "IAP_ACCOUNT_TOKEN_SECRET">): Promise<Response> =>
  new Response(JSON.stringify({ appAccountToken: await deriveAccountToken(uid, env.IAP_ACCOUNT_TOKEN_SECRET) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
