// 배포 직후, 예전 index.html을 들고 있는 탭은 이미 사라진 해시 청크를 lazy import 하다
// 실패한다. 새로고침 한 번이면 새 index.html·청크를 받아 복구되므로 자동으로 1회만 시도한다.
// 시각을 sessionStorage에 남겨, 새로고침 후에도 또 실패하면(배포 롤백 등) 무한 새로고침
// 대신 오류 화면을 보여준다.

export const CHUNK_RELOAD_KEY = "tododo:chunkReloadAt";
// 5분: 새로고침 후 재실패가 느린 망에서 수십 초 뒤에 와도 반복 새로고침되지 않게 넉넉히
// 잡는다. 그래도 몇 시간 뒤 다음 배포 때의 실패는 다시 자동 복구된다.
export const CHUNK_RELOAD_WINDOW_MS = 5 * 60_000;

// 브라우저마다 문구가 다르다: Chrome / Safari / Firefox, 그리고 Vite의 CSS preload 실패.
const CHUNK_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "Unable to preload CSS",
];

export const isChunkLoadError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return CHUNK_ERROR_PATTERNS.some((pattern) => error.message.includes(pattern));
};

export const canAutoReload = (now: number = Date.now()): boolean => {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY));
    // 기록 없음(null → 0)·깨진 값(NaN)은 "기록 없음"으로 본다.
    if (!last) return true;
    return now - last >= CHUNK_RELOAD_WINDOW_MS;
  } catch {
    // 기록을 못 남기는 환경에서 새로고침하면 반복을 막을 방법이 없다.
    return false;
  }
};

export const markAutoReload = (now: number = Date.now()): void => {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    // 쓰기 실패는 무시한다 — canAutoReload가 읽기 단계에서 이미 걸러낸다.
  }
};
