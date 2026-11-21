// "이 브라우저에서 마지막으로 본 인증 상태가 로그인이었다"는 동기 힌트.
//
// Firebase Auth는 로그인 여부를 비동기(IndexedDB 복원 + accounts:lookup)로만 알려 준다.
// 그 응답을 기다린 뒤에야 셸·페이지 청크를 받기 시작하면 네트워크 대기가 직렬로 쌓인다.
// 이 힌트로 시작 시점에 "로그인 사용자일 가능성이 높다"를 판단해 청크를 미리 받는다.
//
// 힌트는 최적화 용도일 뿐 권한 판단에 쓰지 않는다. 틀려도(다른 탭에서 로그아웃 등)
// 쓰이지 않을 청크를 한 번 받는 것뿐이고, 실제 라우팅은 여전히 useAuth가 결정한다.
const KEY = "tododo:signedInHint";

export const readSignedInHint = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export const writeSignedInHint = (signedIn: boolean) => {
  try {
    if (signedIn) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // 저장소가 막혀 있으면 미리 받기만 못 할 뿐 동작에는 영향이 없다.
  }
};
