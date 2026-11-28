import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";

/** demo- 접두사 프로젝트는 에뮬레이터 전용이라 운영 Firebase에 닿지 않는다. */
export const PROJECT_ID = "demo-tododo-rules";

// 실행 위치와 무관하게 레포 루트의 firestore.rules를 읽는다(복사본을 두지 않는다).
const RULES_PATH = fileURLToPath(new URL("../../../../firestore.rules", import.meta.url));

/** host·port는 `firebase emulators:exec`가 설정하는 FIRESTORE_EMULATOR_HOST를 따른다. */
export const createEnv = (): Promise<RulesTestEnvironment> =>
  initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, "utf8") },
  });

/**
 * uid가 null이면 비로그인, 아니면 그 사용자(+토큰 클레임)로 rules가 적용되는 Firestore.
 * rules-unit-testing은 compat 인스턴스를 주지만 모듈러 함수(doc, getDocs…)가 그대로 받는다 —
 * core 함수에 넘기려고 모듈러 타입으로 돌려준다.
 */
export const dbAs = (
  env: RulesTestEnvironment,
  uid: string | null,
  claims?: Record<string, unknown>,
): Firestore => {
  const ctx = uid === null ? env.unauthenticatedContext() : env.authenticatedContext(uid, claims);
  return ctx.firestore() as unknown as Firestore;
};

/** rules를 끄고 사전 데이터를 넣는다. path는 "todos/t1" 같은 문서 경로. */
export const seed = (
  env: RulesTestEnvironment,
  path: string,
  data: Record<string, unknown>,
): Promise<void> =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, path), data);
  });

/** 저장 형태의 할 일 문서. 기본 소유자는 alice. */
export const todoDoc = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  userId: "alice",
  title: "할 일",
  status: "todo",
  priority: "medium",
  startAt: null,
  dueAt: null,
  doneAt: null,
  parentId: null,
  order: 0,
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});
