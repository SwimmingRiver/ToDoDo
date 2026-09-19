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
 * 그 서비스 계정(firebase-adminsdk-*@<project>.iam.gserviceaccount.com)에는 GCP IAM에서
 * 다음 두 역할이 모두 있어야 한다 — 콘솔에서 지연 생성된 계정은 둘 다 비어 있을 수 있다:
 *   - Firebase Admin SDK Administrator Service Agent (Auth 사용자 조회·커스텀 클레임 설정)
 *   - Cloud Datastore User (entitlements 문서 쓰기)
 * 하나만 있으면 각각 auth/insufficient-permission, 7 PERMISSION_DENIED로 실패한다.
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

  // uid 존재 여부를 먼저 확인한다 — 여기서 실패하면(오타 등) Firestore 문서를
  // 쓰기 전에 중단되므로, "문서는 premium인데 클레임은 없는" 불일치 상태가
  // 생기지 않는다. 기존 커스텀 클레임도 함께 얻어 아래에서 병합한다.
  const existingClaims = (await auth.getUser(uid)).customClaims ?? {};

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

  await auth.setCustomUserClaims(uid, { ...existingClaims, premium: isPremium });
  console.log(`${uid} 커스텀 클레임 갱신 완료 (premium: ${isPremium})`);

  console.log(
    "클라이언트는 ID 토큰이 갱신되어야(최대 1시간, 또는 재로그인) 이 변경을 반영한다.",
  );
};

run().catch((error) => {
  console.error("엔타이틀먼트 부여/회수 실패:", error);
  process.exit(1);
});
