import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { app, isEmulator } from "./firebaseApp";

// Firestore SDK는 Firebase 의존성 중 가장 무거운 축에 속한다. Auth(`./firebase`)와
// 분리해 둔 이유는, 이 모듈을 데이터 계층(todoApi 등)에서만 import하게 만들어
// lazy 라우트 청크로 밀어내기 위해서다. 로그인 이전 경로(랜딩/로그인)에서는
// 이 모듈에 닿는 정적 import 경로가 없어야 한다.

export const db = getFirestore(app);

if (isEmulator) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
