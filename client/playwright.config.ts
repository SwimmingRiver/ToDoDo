import { defineConfig, devices } from '@playwright/test'

// 로그인 이후 플로우(할 일 생성/완료, 칸반 드래그, 캘린더)를 검증하려면 실제
// 인증 세션이 필요하지만, headless 브라우저에서는 Google OAuth 팝업을 띄울 수
// 없다. 로컬 Firebase Auth/Firestore 에뮬레이터를 띄우고 앱을
// VITE_USE_FIREBASE_EMULATOR=true로 실행해, e2e/utils/auth.ts가 실제
// signInAnonymously로 에뮬레이터에 로그인한다(자세한 배경은
// src/shared/lib/firebase.ts, src/features/auth/testUtils/e2eAuth.ts 참고).
// "demo-" 프리픽스 프로젝트 ID는 Firebase 에뮬레이터가 실제 자격 증명 없이도
// 인식하는 가짜 프로젝트라서, 운영 Firebase 프로젝트(비밀값)와 완전히 분리된다 —
// 이 값들이 실 프로젝트로 새는 경로가 없다.
const EMULATOR_PROJECT_ID = 'demo-tododo-e2e'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // firebase.json/firestore.rules는 레포 루트에 있다(client/가 아님).
      command: `npx firebase-tools emulators:start --only auth,firestore --project ${EMULATOR_PROJECT_ID} --config ../firebase.json`,
      url: 'http://127.0.0.1:9099',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: 'npm run dev -- --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        VITE_USE_FIREBASE_EMULATOR: 'true',
        VITE_FIREBASE_API_KEY: 'demo-api-key',
        VITE_FIREBASE_AUTH_DOMAIN: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
        VITE_FIREBASE_PROJECT_ID: EMULATOR_PROJECT_ID,
        VITE_FIREBASE_STORAGE_BUCKET: `${EMULATOR_PROJECT_ID}.appspot.com`,
        VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
        VITE_FIREBASE_APP_ID: 'demo-app-id',
        VITE_FIREBASE_MEASUREMENT_ID: '',
      },
    },
  ],
})
