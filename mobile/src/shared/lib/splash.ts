import * as SplashScreen from "expo-splash-screen";

/**
 * 네이티브 스플래시(app.json의 expo-splash-screen 설정)를 로그인 상태가 정해질 때까지 유지한다.
 * 그동안 흰 화면 + 로딩 표시가 잠깐 보이던 것을 없앤다.
 *
 * Expo 문서 권장대로 모듈 최상위에서 기다리지 않고 preventAutoHideAsync를 부른다 — 이 모듈은
 * App.tsx가 일찍 불러온다. 네이티브 모듈이 없는 환경(이 설정 전 개발 빌드 등)에서는 실패해도
 * 앱을 막지 않도록 삼킨다.
 */

/** 준비 신호(hideSplash)가 끝내 오지 않아도 이 시간이 지나면 숨긴다 — 스플래시에 갇히지 않게. */
export const SPLASH_FAILSAFE_MS = 8000;

let hidden = false;

export const hideSplash = (): void => {
  if (hidden) return;
  hidden = true;
  SplashScreen.hide();
};

SplashScreen.preventAutoHideAsync().catch(() => {});
setTimeout(hideSplash, SPLASH_FAILSAFE_MS);
