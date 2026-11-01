/** isAllowedOrigin이 읽는 최소 설정. 각 Worker의 Env가 구조적으로 이 타입을 만족한다. */
export interface OriginEnv {
  CLIENT_APP_URL: string;
  FIREBASE_PROJECT_ID: string;
}

// Firebase Hosting은 커스텀 도메인(CLIENT_APP_URL)을 연결해도 같은 사이트를 web.app과
// firebaseapp.com 기본 도메인으로 계속 서빙한다. 기존 web.app 주소로 접속하는 사용자가
// 끊기지 않도록 두 기본 도메인을 모두 허용한다. 로컬 개발과 CI E2E는 별도 로컬 Worker를 띄우지 않고 배포된 Worker를
// 그대로 바라보도록 배선돼 있어, localhost 개발 서버 origin도 허용해야 한다. CORS는
// 브라우저의 응답 열람만 막을 뿐 서버 접근 자체를 막지 않고 모든 엔드포인트가
// Firebase ID 토큰 검증을 거치므로, localhost origin을 허용해도 보안 저하는 없다.
export const isAllowedOrigin = (origin: string | null, env: OriginEnv): origin is string => {
  if (!origin) return false;
  if (origin === env.CLIENT_APP_URL) return true;
  if (origin === `https://${env.FIREBASE_PROJECT_ID}.web.app`) return true;
  if (origin === `https://${env.FIREBASE_PROJECT_ID}.firebaseapp.com`) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
  return false;
};
