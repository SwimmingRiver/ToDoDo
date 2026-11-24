/**
 * PM이 특정 사용자에게 운영자(operator) 권한을 부여하거나 회수한다.
 * Firebase Auth 커스텀 클레임 `operator: true`만 설정·제거하고,
 * premiumUntil 등 기존 클레임은 그대로 보존한다. (firestore.rules·관리자 페이지가 이 클레임을 읽는다)
 *
 * 실행 전 GOOGLE_APPLICATION_CREDENTIALS 환경변수에 서비스 계정 키 파일 경로를 설정해야 한다.
 * (Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성)
 *
 * 그 서비스 계정(firebase-adminsdk-*@<project>.iam.gserviceaccount.com)에는 GCP IAM에서
 * 다음 역할이 있어야 한다 — 콘솔에서 지연 생성된 계정은 비어 있을 수 있다:
 *   - Firebase Admin SDK Administrator Service Agent (Auth 사용자 조회·커스텀 클레임 설정)
 * Firestore 쓰기는 하지 않으므로 Cloud Datastore User는 필요 없다.
 *
 * 사용법:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/keys/tododo-sa.json npm run grant:operator -- --uid <uid> [--revoke]
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { mergeOperatorClaim } from "./lib/mergeOperatorClaim";

interface ParsedArgs {
  uid: string;
  revoke: boolean;
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const index = argv.indexOf("--uid");
  const uid = index !== -1 ? argv[index + 1] : undefined;
  if (!uid || uid.startsWith("--")) throw new Error("--uid <uid> 인자가 필요합니다");
  return { uid, revoke: argv.includes("--revoke") };
};

const run = async () => {
  const { uid, revoke } = parseArgs(process.argv.slice(2));

  initializeApp({ credential: applicationDefault() });
  const auth = getAuth();

  // uid 존재 여부를 먼저 확인하고, 기존 커스텀 클레임을 얻어 병합한다.
  const existing = (await auth.getUser(uid)).customClaims;
  const next = mergeOperatorClaim(existing, !revoke);
  await auth.setCustomUserClaims(uid, next);

  console.log(`${uid} 운영자 클레임 ${revoke ? "회수" : "부여"} 완료 (claims: ${JSON.stringify(next)})`);
  console.log("해당 사용자가 다시 로그인하거나 토큰이 갱신되는 1시간 뒤에 반영된다.");
};

run().catch((error) => {
  console.error("운영자 클레임 부여/회수 실패:", error);
  process.exit(1);
});
