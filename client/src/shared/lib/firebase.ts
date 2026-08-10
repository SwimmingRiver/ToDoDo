import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { app, isEmulator } from "./firebaseApp";

// ⚠️ 이 모듈은 Firebase **Auth 전용**이다. Firestore는 `./firestore`에 따로 있다.
//
// AuthProvider가 앱 진입 시점에 이 모듈을 정적으로 import하기 때문에, 여기 있는 것은
// 전부 초기 청크에 들어간다. 여기서 `getFirestore`를 다시 import하면 라우트를 아무리
// lazy로 쪼개도 Firestore SDK(gzip 기준 수십 kB)가 초기 다운로드로 되돌아온다.
// 랜딩/로그인 화면만 보는 방문자는 Firestore를 전혀 쓰지 않는다.
//
// Firestore가 필요하면 `import { db } from "@/shared/lib/firestore"`를 쓸 것.

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

if (isEmulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}
