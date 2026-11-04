import AsyncStorage from "@react-native-async-storage/async-storage";

export const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const keyFor = (uid: string) => `startupMaintenance:lastSuccess:${uid}`;

/** 실행 기록이 없거나 마지막 성공 후 24시간 이상 지났으면 true다. */
export function shouldRunOnForeground(lastSuccessMs: number | null, nowMs: number): boolean {
  if (lastSuccessMs === null) return true;
  return nowMs - lastSuccessMs >= MAINTENANCE_INTERVAL_MS;
}

/** uid별 마지막 성공 시각(ms)을 읽는다. 읽기 실패나 숫자가 아닌 값은 null로 본다. */
export async function readLastSuccess(uid: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(uid));
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export async function writeLastSuccess(uid: string, ms: number): Promise<void> {
  await AsyncStorage.setItem(keyFor(uid), String(ms));
}
