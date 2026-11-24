export type Platform = "web" | "ios" | "android";

export interface NewFeedback {
  userId: string;
  email: string | null;
  content: string;
  platform: Platform;
  /** 서버 시각 ISO 문자열 */
  createdAt: string;
}

/** 서비스 계정으로 feedback 컬렉션에 새 문서를 쓴다(보안 규칙 우회). */
export class FeedbackStore {
  private readonly base: string;

  constructor(
    projectId: string,
    private readonly getToken: () => Promise<string>,
    // 전역 fetch를 그대로 기본값으로 담으면 Workers가 "Illegal invocation"을 던진다.
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  }

  async create(doc: NewFeedback): Promise<void> {
    const token = await this.getToken();
    const res = await this.fetchFn(`${this.base}/feedback`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          userId: { stringValue: doc.userId },
          email: doc.email === null ? { nullValue: null } : { stringValue: doc.email },
          content: { stringValue: doc.content },
          platform: { stringValue: doc.platform },
          // 새 의견은 항상 "new"로 시작한다. 운영자가 나중에 바꾼다.
          status: { stringValue: "new" },
          createdAt: { stringValue: doc.createdAt },
        },
      }),
    });
    if (!res.ok) throw new Error(`Firestore 의견 저장 실패 (${res.status})`);
  }
}
