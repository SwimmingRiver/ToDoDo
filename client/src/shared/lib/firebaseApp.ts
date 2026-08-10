import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);

// E2E(Playwright) 전용 스위치. 실제 Google OAuth 팝업을 띄울 수 없는 headless
// 브라우저에서 로그인 이후 플로우(할 일 생성/완료, 칸반 드래그, 캘린더)를
// 검증하기 위해, 로컬 Firebase Auth/Firestore 에뮬레이터에 연결한다.
// 일반 dev/prod 빌드에서는 false이므로 실 서비스 동작에 영향이 없다.
// 실제 연결은 auth/firestore를 각각 초기화하는 firebase.ts, firestore.ts에서 한다.
export const isEmulator =
  import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true";
