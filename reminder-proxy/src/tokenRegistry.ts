import type { ReminderStore } from "./store";

/**
 * 토큰 등록·해제의 저장소 규칙. DO(scheduler.ts)는 cloudflare:workers에 묶여 단위 테스트가 안 되므로
 * 판단이 있는 부분만 여기에 둔다.
 *
 * 핵심 규칙: 빈 저장소에는 uid를 새로 쓰지 않는다. 탈퇴(DELETE /account) 직후 웹 logout()이 아직
 * 유효한 ID 토큰으로 토큰 해제·refresh를 보내는데, 이때 uid가 되살아나면 지워진 사용자의 DO 상태가 남는다.
 */

export const registerTokenState = (
  store: ReminderStore,
  uid: string,
  token: string,
  platform: string,
  now: number,
): void => {
  store.setMeta("uid", uid);
  store.upsertToken(token, platform, now);
};

/** 해제는 uid를 기록하지 않는다 — 지울 토큰만 지운다. */
export const unregisterTokenState = (store: ReminderStore, token: string): void => {
  store.deleteToken(token);
};

/** 알림을 켠 기기가 있을 때만 uid를 기록하고 true. 없으면 아무것도 쓰지 않고 false. */
export const hasRefreshableTokens = (store: ReminderStore, uid: string): boolean => {
  if (store.listTokens().length === 0) return false;
  store.setMeta("uid", uid);
  return true;
};
