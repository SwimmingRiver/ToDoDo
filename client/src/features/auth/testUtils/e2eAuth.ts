import { signInAnonymously, signOut } from "firebase/auth";
import { auth } from "@/shared/lib/firebase";

/**
 * E2E(Playwright) 전용 헬퍼. 어떤 프로덕션 코드에서도 import하지 않으므로
 * `npm run build` 결과물(실제 배포 번들)에는 포함되지 않는다 — Vite는 실제로
 * 도달 가능한 import 그래프만 번들링한다. Playwright는 이 파일을 앱 어디에서도
 * 참조하지 않은 채로, dev 서버가 서빙하는 소스 경로
 * (/src/features/auth/testUtils/e2eAuth.ts)를 브라우저 컨텍스트에서 직접
 * dynamic import해서만 사용한다(e2e/utils/auth.ts 참고).
 *
 * Google OAuth 팝업을 흉내 내는 대신, VITE_USE_FIREBASE_EMULATOR=true일 때
 * firebase.ts가 연결해 둔 로컬 Auth 에뮬레이터에 실제로 signInAnonymously를
 * 호출한다. 이 파일이 import하는 `auth`는 앱 전역에서 쓰는 것과 동일한
 * 싱글턴(같은 모듈 URL로 캐시됨)이므로, 로그인 성공 시 AuthProvider의
 * onAuthStateChanged 리스너가 실제 로그인과 동일하게 반응한다.
 */
export async function e2eSignIn(): Promise<string> {
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}

export async function e2eSignOut(): Promise<void> {
  await signOut(auth);
}
