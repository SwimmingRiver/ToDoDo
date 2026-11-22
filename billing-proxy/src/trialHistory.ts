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

/**
 * 방침 "체험을 사용한 계정을 회원 탈퇴한 날부터 1년". 365일 고정이 아니라 달력 기준 1년이다 —
 * 2028-02-29처럼 윤일이 끼면 365일은 약속보다 하루 짧다.
 */
export const trialHistoryExpireAt = (recordedAt: Date): Date => {
  const expireAt = new Date(recordedAt.getTime());
  expireAt.setUTCFullYear(expireAt.getUTCFullYear() + 1);
  return expireAt;
};

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
  private readonly docRoot: string;

  constructor(
    projectId: string,
    private readonly getToken: () => Promise<string>,
    // 전역 fetch를 그대로 기본값으로 담으면 Workers가 "Illegal invocation"을 던진다.
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.docRoot = `projects/${projectId}/databases/(default)/documents`;
    this.base = `https://firestore.googleapis.com/v1/${this.docRoot}`;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getToken();
    return this.fetchFn(`${this.base}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
  }

  /**
   * 한 번의 commit으로 원자적으로 쓴다 — 연결된 구글·Apple 키 중 하나만 남는 부분 기록을 막는다.
   * 같은 키는 덮어쓴다(마지막 기록 기준으로 1년). 만료 문서 삭제는 별도 정리 작업(후속) — Firestore TTL은 무료 요금제에서 못 쓴다.
   */
  async record(entries: readonly TrialIdentityKey[], now: Date): Promise<void> {
    if (entries.length === 0) return;
    const expireAt = trialHistoryExpireAt(now).toISOString();
    const res = await this.request(":commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        writes: entries.map(({ provider, key }) => ({
          update: {
            name: `${this.docRoot}/trialHistory/${key}`,
            fields: {
              provider: { stringValue: provider },
              recordedAt: { stringValue: now.toISOString() },
              expireAt: { timestampValue: expireAt },
            },
          },
        })),
      }),
    });
    if (!res.ok) throw new Error(`Firestore 체험 사용 확인값 기록 실패 (${res.status})`);
  }

  /** 만료 전 기록이 하나라도 있으면 true. 키(최대 2개)는 동시에 조회한다. 만료 문서가 남아 있을 수 있어 expireAt을 직접 비교한다. */
  async hasActive(keys: readonly string[], now: Date): Promise<boolean> {
    const found = await Promise.all(
      keys.map(async (key) => {
        const res = await this.request(`/trialHistory/${key}`);
        if (res.status === 404) return false;
        if (!res.ok) throw new Error(`Firestore 체험 사용 확인값 조회 실패 (${res.status})`);
        const body = (await res.json()) as { fields?: { expireAt?: { timestampValue?: string } } };
        const expireAt = body.fields?.expireAt?.timestampValue;
        return !!expireAt && new Date(expireAt).getTime() > now.getTime();
      }),
    );
    return found.some(Boolean);
  }
}
