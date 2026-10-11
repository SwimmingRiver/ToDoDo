export class UserNotFoundError extends Error {
  constructor(uid: string) {
    super(`Firebase Auth 사용자 없음: ${uid}`);
    this.name = "UserNotFoundError";
  }
}

/**
 * Identity Toolkit REST로 커스텀 클레임을 쓴다. 다른 클레임을 지우지 않도록 읽어서 병합하고,
 * 예전 형식의 premium 불리언은 제거한다(판단은 premiumUntil만 한다).
 */
export class ClaimsClient {
  private readonly base: string;

  constructor(
    projectId: string,
    private readonly getToken: () => Promise<string>,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.base = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
  }

  private async post(path: string, body: unknown): Promise<Response> {
    const token = await this.getToken();
    return this.fetchFn(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  async setPremiumUntil(uid: string, premiumUntilSec: number): Promise<void> {
    const lookup = await this.post("/accounts:lookup", { localId: [uid] });
    if (!lookup.ok) throw new Error(`Auth 사용자 조회 실패 (${lookup.status})`);
    const { users } = (await lookup.json()) as { users?: { customAttributes?: string }[] };
    if (!users || users.length === 0) throw new UserNotFoundError(uid);

    const existing = users[0].customAttributes ? (JSON.parse(users[0].customAttributes) as Record<string, unknown>) : {};
    const { premium: _legacy, ...rest } = existing;
    const update = await this.post("/accounts:update", {
      localId: uid,
      customAttributes: JSON.stringify({ ...rest, premiumUntil: premiumUntilSec }),
    });
    if (!update.ok) throw new Error(`커스텀 클레임 설정 실패 (${update.status})`);
  }

  /** 탈퇴의 마지막 단계. 이전 시도에서 이미 지워졌으면(USER_NOT_FOUND) 성공으로 본다. */
  async deleteUser(uid: string): Promise<void> {
    const res = await this.post("/accounts:delete", { localId: uid });
    if (res.ok) return;
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (body?.error?.message?.startsWith("USER_NOT_FOUND")) return;
    throw new Error(`Auth 사용자 삭제 실패 (${res.status})`);
  }
}
