import type { LoginProvider, VerifiedToken } from "@tododo/worker-auth";
import { hmacSha256Hex } from "./hmac";

/**
 * 탈퇴 후 재가입 체험 재지급 방지(docs/superpowers/specs/2026-11-22-trial-reuse-after-deletion-design.md).
 *
 * 체험을 쓴 계정이 탈퇴하면 로그인 제공자 식별자(google.com·apple.com의 sub)를 TRIAL_HMAC_SECRET으로
 * HMAC한 값을 trialHistory/{값}에 1년 남기고, 웹 /trial이 같은 값으로 조회해 거절한다.
 * 문서에는 제공자·기록 시각·만료 시각만 둔다 — uid·이메일·원래 sub는 넣지 않는다.
 * TRIAL_HMAC_SECRET을 바꾸면 기존 기록을 못 찾으므로 회전하지 않는다.
 */

/** 4판(약관·방침) 시행 시각 = 2026-12-28 00:00 서울. client/src/features/legal/config.ts LEGAL_REVISIONS와 같은 날이어야 한다. */
export const TRIAL_HISTORY_START = new Date("2026-12-27T15:00:00.000Z");

/** 방침 "체험을 사용한 계정을 회원 탈퇴한 날부터 1년". */
export const TRIAL_HISTORY_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export interface TrialIdentityKey {
  provider: LoginProvider;
  key: string;
}

/** 제공자 접두사를 붙여 해시한다 — 구글·Apple의 sub가 우연히 같아도 섞이지 않는다. */
export const trialIdentityKeys = async (
  secret: string,
  identities: VerifiedToken["identities"],
): Promise<TrialIdentityKey[]> => {
  const keys: TrialIdentityKey[] = [];
  for (const provider of ["google.com", "apple.com"] as const) {
    for (const sub of identities[provider] ?? []) {
      keys.push({ provider, key: await hmacSha256Hex(secret, `${provider}:${sub}`) });
    }
  }
  return keys;
};

/** 서비스 계정으로 trialHistory/{key}를 읽고 쓴다(보안 규칙상 클라이언트는 접근 불가). */
export class TrialHistoryStore {
  private readonly base: string;

  constructor(
    projectId: string,
    private readonly getToken: () => Promise<string>,
    // 전역 fetch를 그대로 기본값으로 담으면 Workers가 "Illegal invocation"을 던진다.
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getToken();
    return this.fetchFn(`${this.base}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
  }

  /** 같은 키는 덮어쓴다(마지막 기록 기준으로 1년). expireAt은 Firestore TTL 정책 대상 필드다. */
  async record(entries: readonly TrialIdentityKey[], now: Date): Promise<void> {
    const expireAt = new Date(now.getTime() + TRIAL_HISTORY_TTL_MS).toISOString();
    for (const { provider, key } of entries) {
      const res = await this.request(`/trialHistory/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            provider: { stringValue: provider },
            recordedAt: { stringValue: now.toISOString() },
            expireAt: { timestampValue: expireAt },
          },
        }),
      });
      if (!res.ok) throw new Error(`Firestore 체험 사용 확인값 기록 실패 (${res.status})`);
    }
  }

  /** 만료 전 기록이 하나라도 있으면 true. TTL 삭제는 지연될 수 있어 expireAt을 직접 비교한다. */
  async hasActive(keys: readonly string[], now: Date): Promise<boolean> {
    for (const key of keys) {
      const res = await this.request(`/trialHistory/${key}`);
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`Firestore 체험 사용 확인값 조회 실패 (${res.status})`);
      const body = (await res.json()) as { fields?: { expireAt?: { timestampValue?: string } } };
      const expireAt = body.fields?.expireAt?.timestampValue;
      if (expireAt && new Date(expireAt).getTime() > now.getTime()) return true;
    }
    return false;
  }
}
