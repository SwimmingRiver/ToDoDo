import { configDefaults, defineConfig } from "vitest/config";

// rules 테스트(src/__rules__)는 Firestore 에뮬레이터가 필요해 기본 실행에서 뺀다.
// 실행은 `npm run test:rules`(vitest.rules.config.ts).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "src/__rules__/**"],
  },
});
