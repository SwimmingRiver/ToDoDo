import { auth } from "../../firebase";
import type { StorePurchase } from "./purchaseClient";

export type VerifyFailure = "LINKED_TO_OTHER_ACCOUNT" | "ALREADY_SUBSCRIBED" | "PENDING" | "INVALID" | "NETWORK";
export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure };

/** Expo는 process.env.EXPO_PUBLIC_*를 빌드 시 인라인한다. 함수 안에서 읽어 테스트가 값을 바꿀 수 있게 한다. */
const billingUrl = (): string => process.env.EXPO_PUBLIC_BILLING_PROXY_URL ?? "";

const postWithIdToken = async (path: string, body?: unknown): Promise<Response> => {
  const baseUrl = billingUrl();
  if (!baseUrl) throw new Error("EXPO_PUBLIC_BILLING_PROXY_URL 미설정");
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const idToken = await user.getIdToken();
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

const readJson = async (res: Response): Promise<Record<string, unknown> | null> => {
  try {
    const data: unknown = await res.json();
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** 구매 때 스토어에 넘길 계정 토큰(Apple appAccountToken·Google obfuscatedAccountId). 서버가 uid에서 만든다. */
export const fetchAccountToken = async (): Promise<string> => {
  const res = await postWithIdToken("/iap/account-token");
  if (!res.ok) throw new Error(`/iap/account-token 실패 (${res.status})`);
  const data = await readJson(res);
  const token = data?.appAccountToken;
  if (typeof token !== "string" || !token) throw new Error("/iap/account-token 응답 형식 오류");
  return token;
};

/**
 * 거래를 서버에 보내 권한을 반영한다. ok가 아니면 호출자는 거래를 끝내지 않는다 — 끝내지 않은 거래는
 * 다음 실행·복원 때 다시 검증된다. 실패 사유는 "다시 해 볼 만한지"(NETWORK)와 화면 안내용으로 나눈다.
 */
export const verifyPurchase = async (p: StorePurchase): Promise<VerifyResult> => {
  const [path, body] =
    p.platform === "ios"
      ? ["/iap/apple/verify", { jws: p.proof }]
      : ["/iap/google/verify", { purchaseToken: p.proof, productId: p.productId }];

  let res: Response;
  try {
    res = await postWithIdToken(path, body);
  } catch (error) {
    console.warn("[iap] verify 요청 실패", error);
    return { ok: false, reason: "NETWORK" };
  }

  const data = await readJson(res);
  if (res.ok) {
    // 200인데 JSON이 아니면 우리 서버 응답이 아니다(프록시 오류 페이지 등) — 반영됐다고 믿지 않는다.
    if (!data) return { ok: false, reason: "NETWORK" };
    // Google 결제 대기: 아직 권한이 없다. 결제가 끝나면 스토어가 구매 이벤트를 다시 보낸다.
    if (data.pending === true) return { ok: false, reason: "PENDING" };
    return { ok: true };
  }
  // 409는 두 가지 뜻이 있어 상태 코드가 아니라 error 필드로 구분한다.
  if (res.status === 409) {
    if (data?.error === "LINKED_TO_OTHER_ACCOUNT") return { ok: false, reason: "LINKED_TO_OTHER_ACCOUNT" };
    if (data?.error === "ALREADY_SUBSCRIBED") return { ok: false, reason: "ALREADY_SUBSCRIBED" };
    return { ok: false, reason: "INVALID" };
  }
  // 401은 토큰 만료 같은 일시 문제라 다시 시도할 만하다. 나머지 4xx는 다시 보내도 같은 결과다.
  if (res.status >= 400 && res.status < 500 && res.status !== 401) return { ok: false, reason: "INVALID" };
  return { ok: false, reason: "NETWORK" };
};
