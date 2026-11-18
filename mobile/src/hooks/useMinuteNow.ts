import { useSyncExternalStore } from "react";

const TICK_MS = 60_000;

/**
 * 웹 shared/hooks/useMinuteNow와 같은 계약 — 모든 구독자가 공유하는 1분 간격 현재 시각.
 * interval은 모듈에 하나만 두고 구독자가 0이 되면 정리한다. snapshot은 tick 때만 바뀌는
 * 같은 Date 객체여야 한다(매번 새 객체면 무한 렌더).
 */
let now = new Date();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    now = new Date();
    timer = setInterval(() => {
      now = new Date();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => now;

export function useMinuteNow(): Date {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
