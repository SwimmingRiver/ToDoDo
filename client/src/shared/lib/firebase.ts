import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  connectAuthEmulator,
} from "firebase/auth";
import { app, isEmulator } from "./firebaseApp";

// ⚠️ 이 모듈은 Firebase **Auth 전용**이다. Firestore는 `./firestore`에 따로 있다.
//
// AuthProvider가 앱 진입 시점에 이 모듈을 정적으로 import하기 때문에, 여기 있는 것은
// 전부 초기 청크에 들어간다. 여기서 `getFirestore`를 다시 import하면 라우트를 아무리
// lazy로 쪼개도 Firestore SDK(gzip 기준 수십 kB)가 초기 다운로드로 되돌아온다.
// 랜딩/로그인 화면만 보는 방문자는 Firestore를 전혀 쓰지 않는다.
//
// Firestore가 필요하면 `import { db } from "@/shared/lib/firestore"`를 쓸 것.

// getAuth() 대신 initializeAuth를 쓰는 이유: getAuth는 브라우저 기본값으로
// browserPopupRedirectResolver까지 붙여 시작 시점에 팝업/리디렉트 처리기를 초기화한다
// (getProjectConfig 호출 + 리디렉트 결과 확인용 사용자 재조회). 이미 로그인한 사용자의
// 첫 화면에는 필요 없는 네트워크 왕복이라, 처리기는 로그인 버튼에서만 넘긴다(loginPage).
// persistence는 getAuth의 브라우저 기본값과 같은 순서로 둬야 기존 로그인 세션(IndexedDB)이 유지된다.
export const auth = initializeAuth(app, {
  persistence: [
    indexedDBLocalPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
  ],
});
export const googleProvider = new GoogleAuthProvider();

if (isEmulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}
