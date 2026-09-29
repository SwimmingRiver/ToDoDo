/** refresh 신호를 이만큼 모았다가 한 번에 재계산한다. */
export const REFRESH_DEBOUNCE_MS = 5_000;

/**
 * refresh 신호를 받았을 때 걸 알람 시각. 기존 알람을 그대로 두면 되면 null.
 * - 없거나 목표보다 늦은 알람(다음 발송·창 끝)은 now + 디바운스로 앞당긴다.
 * - 목표 이전의 "미래" 알람은 그대로 둔다 — 여러 신호를 한 번의 재계산으로 모은다.
 * - 이미 지난 알람은 다시 건다. 재시도가 소진됐거나 런타임이 타이머를 잃은 경우 그 알람은
 *   다시 울리지 않으므로, 그대로 두면 refresh가 영영 처리되지 않는다. 실행 대기 중인
 *   알람이었다면 몇 초 늦춰질 뿐이다.
 */
export const nextRefreshAlarm = (current: number | null, now: number): number | null => {
  const target = now + REFRESH_DEBOUNCE_MS;
  if (current === null || current <= now || current > target) return target;
  return null;
};
