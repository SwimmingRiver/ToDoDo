/**
 * PM이 특정 사용자에게 프리미엄 엔타이틀먼트를 부여하거나 회수한다.
 * entitlements/{uid} Firestore 문서(클라이언트 UI가 읽는 소스)와 Firebase Auth
 * 커스텀 클레임(firestore.rules·calendar-proxy가 읽는 서버 검증용)을 함께
 * 설정한다 — 둘 중 하나만 바꾸면 클라이언트가 보여주는 상태와 서버가 실제로
 * 허용하는 상태가 어긋난다.
 *
 * 실행 전 GOOGLE_APPLICATION_CREDENTIALS 환경변수에 서비스 계정 키 파일 경로를 설정해야 한다.
 * (Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성)
 *
 * 사용법:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run grant:entitlement -- --uid <uid> --plan premium
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run grant:entitlement -- --uid <uid> --plan free
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

interface ParsedArgs {
  uid: string;
  plan: "premium" | "free";
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const uidIndex = argv.indexOf("--uid");
  const planIndex = argv.indexOf("--plan");
  const uid = uidIndex !== -1 ? argv[uidIndex + 1] : undefined;
  const plan = planIndex !== -1 ? argv[planIndex + 1] : undefined;

  if (!uid) throw new Error("--uid <uid> 인자가 필요합니다");
  if (plan !== "premium" && plan !== "free") {
    throw new Error("--plan은 premium 또는 free여야 합니다");
  }
  return { uid, plan };
};

const run = async () => {
  const { uid, plan } = parseArgs(process.argv.slice(2));
  const isPremium = plan === "premium";

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const auth = getAuth();

  await db.doc(`entitlements/${uid}`).set(
    {
      plan,
      status: isPremium ? "active" : "none",
      source: "manual",
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  console.log(`entitlements/${uid} 문서 갱신 완료 (plan: ${plan})`);

  await auth.setCustomUserClaims(uid, { premium: isPremium });
  console.log(`${uid} 커스텀 클레임 갱신 완료 (premium: ${isPremium})`);
};

run().catch((error) => {
  console.error("엔타이틀먼트 부여/회수 실패:", error);
  process.exit(1);
});
