/**
 * 앱 진입 유지보수(스윕)를 사용자별로 페이지 수명 동안 한 번만 돌리기 위한 가드.
 *
 * App(앱 셸)은 /terms 같은 셸 밖 라우트에 다녀오면 언마운트→재마운트되므로, 컴포넌트의
 * useRef로는 막을 수 없다(재마운트 때 초기화된다). 그래서 모듈 수준에 둔다. 사용자를 키로
 * 두는 이유는 같은 탭에서 다른 계정으로 다시 로그인하면 그 계정 몫으로 돌아야 하기 때문이다.
 */
const claimedUids = new Set<string>();

export const claimStartupMaintenance = (uid: string): boolean => {
  if (claimedUids.has(uid)) return false;
  claimedUids.add(uid);
  return true;
};

/** 테스트 전용. */
export const resetStartupMaintenanceGate = (): void => {
  claimedUids.clear();
};
