import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { runAlarm } from "./alarmRunner";
import { sendPush } from "./fcm";
import { FirestoreClient } from "./firestore";
import { GoogleTokenProvider, parseServiceAccount } from "./googleAuth";
import { SqliteReminderStore } from "./store";
import { nextRefreshAlarm } from "./refreshAlarm";

/**
 * 사용자(uid)당 1개. 로직은 alarmRunner(테스트됨)에 있고 여기는 DO API와 이어주는 얇은 어댑터다.
 * DO는 단일 스레드라 같은 사용자의 알람 처리가 동시에 돌지 않는다.
 */
export class ReminderScheduler extends DurableObject<Env> {
  private readonly store: SqliteReminderStore;
  private tokenProvider: GoogleTokenProvider | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new SqliteReminderStore(ctx.storage.sql);
  }

  async registerToken(uid: string, token: string, platform: string): Promise<void> {
    this.store.setMeta("uid", uid);
    this.store.upsertToken(token, platform, Date.now());
    await this.requestRefresh(uid);
  }

  async unregisterToken(uid: string, token: string): Promise<void> {
    this.store.setMeta("uid", uid);
    this.store.deleteToken(token);
  }

  async requestRefresh(uid: string): Promise<void> {
    this.store.setMeta("uid", uid);
    // 알림을 켠 기기가 없으면 알람조차 걸지 않는다(DO 쓰기·Firestore 읽기 0).
    if (this.store.listTokens().length === 0) return;
    this.store.setMeta("refreshPending", "1");
    const next = nextRefreshAlarm(await this.ctx.storage.getAlarm(), Date.now());
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  async alarm(): Promise<void> {
    const uid = this.store.getMeta("uid");
    if (!uid) return;
    const tokenProvider = this.getTokenProvider();
    const firestore = new FirestoreClient(this.env.FIREBASE_PROJECT_ID, () => tokenProvider.getToken());
    const next = await runAlarm({
      store: this.store,
      now: Date.now,
      uid,
      firestore,
      sendPush: async (message) =>
        sendPush(this.env.FIREBASE_PROJECT_ID, await tokenProvider.getToken(), message),
      appUrl: this.env.CLIENT_APP_URL,
    });
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }

  private getTokenProvider(): GoogleTokenProvider {
    this.tokenProvider ??= new GoogleTokenProvider(parseServiceAccount(this.env.GOOGLE_SERVICE_ACCOUNT));
    return this.tokenProvider;
  }
}
