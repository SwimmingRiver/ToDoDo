import { browserPopupRedirectResolver } from "firebase/auth";
// SDK 내부 API — 공개 API에는 팝업 처리기를 미리 준비하는 함수가 없다.
// _getInstance는 signInWithPopup 등이 쓰는 것과 같은 처리기 인스턴스(클래스별 캐시)를 돌려준다.
import { _getInstance } from "@firebase/auth/internal";
import { auth } from "@/shared/lib/firebase";

interface PopupResolverInternal {
  _initialize(auth: unknown): Promise<unknown>;
}

/**
 * 팝업 처리기(구글 iframe)를 미리 로드한다.
 *
 * 처리기 없이 initializeAuth를 쓰므로(#195) 첫 팝업 호출이 iframe 로드를 기다린 뒤에야
 * window.open을 부른다. Safari는 그 사이 클릭 제스처를 잃어 첫 팝업을 막는다(2026-11-23 운영 재현).
 * 팝업 버튼이 있는 화면에 들어올 때 불러 두면 클릭 시 바로 열린다. 실패해도 팝업 호출 때 다시
 * 초기화되므로(지금과 같은 동작) 오류는 기록만 한다.
 */
export const warmUpPopupResolver = (): void => {
  try {
    _getInstance<PopupResolverInternal>(browserPopupRedirectResolver)
      ._initialize(auth)
      .catch((error: unknown) => console.error("팝업 처리기 미리 준비 실패:", error));
  } catch (error) {
    console.error("팝업 처리기 미리 준비 실패:", error);
  }
};
