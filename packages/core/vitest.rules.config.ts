import { defineConfig } from "vitest/config";

// Firestore rules 테스트 — `npm run test:rules`로 실행한다(에뮬레이터를 띄우고 내림).
// 로컬 함정: JAVA_HOME이 JDK 21이어야 하고, 8085 포트가 비어 있어야 한다(`lsof -i :8085`).
// E2E 에뮬레이터(8080)와 포트를 나눠 두 테스트를 동시에 돌려도 충돌하지 않는다.
export default defineConfig({
  test: {
    include: ["src/__rules__/**/*.rules.test.ts"],
    // 테스트 파일들이 같은 에뮬레이터 데이터를 공유한다 — 병렬이면 한 파일의 clearFirestore가
    // 다른 파일의 사전 데이터를 지운다.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
