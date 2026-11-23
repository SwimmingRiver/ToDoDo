import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * 로그아웃 정리(서버 토큰 삭제·기기 FCM 토큰 삭제)가 끝나지 않았다는 표시. 오프라인 로그아웃 등으로
 * 삭제가 실패하면 토큰이 살아 있는 채 이전 계정의 DO에 남는다. 다음 계정이 같은 기기에서 getToken()으로
 * 그 토큰을 그대로 받아 등록하면 이전 계정의 알림이 이 기기에 오므로, 다음 동기화가 등록 전에 먼저 처리한다.
 *
 * token이 ""이면 토큰을 받지 못한 채 기기 삭제도 실패한 경우다 — 서버 삭제는 건너뛰고 기기 삭제만 재시도한다.
 */
export type ReleasePending = { token: string; uid: string; serverDeleted: boolean; deviceDeleted: boolean };

const RELEASE_PENDING_KEY = "tododo:pushReleasePending";

const CORRUPT_PENDING: ReleasePending = { token: "", uid: "", serverDeleted: false, deviceDeleted: false };

const isReleasePending = (value: unknown): value is ReleasePending => {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.token === "string" &&
    typeof v.uid === "string" &&
    typeof v.serverDeleted === "boolean" &&
    typeof v.deviceDeleted === "boolean"
  );
};

export const loadReleasePending = async (): Promise<ReleasePending | null> => {
  const raw = await AsyncStorage.getItem(RELEASE_PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isReleasePending(parsed)) return parsed;
  } catch {
    // 아래로 넘어간다.
  }
  // 값이 깨져도 대기가 있었다는 사실은 남는다. 무시하면 옛 토큰을 새 계정에 등록할 수 있으므로
  // 가장 보수적으로(기기 삭제부터, 서버 삭제는 건너뜀) 처리한다.
  return { ...CORRUPT_PENDING };
};

export const saveReleasePending = async (p: ReleasePending): Promise<void> => {
  await AsyncStorage.setItem(RELEASE_PENDING_KEY, JSON.stringify(p));
};

export const clearReleasePending = async (): Promise<void> => {
  await AsyncStorage.removeItem(RELEASE_PENDING_KEY);
};
