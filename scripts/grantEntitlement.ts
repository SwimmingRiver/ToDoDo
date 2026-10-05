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
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run grant:entitlement -- --uid <uid> --plan premium [--until 2027-01-01T00:00:00.000Z]
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

interface ParsedArgs {
  uid: string;
  plan: "premium" | "free";
  /** premium일 때만 쓴다. 기본은 사실상 무기한. */
  until: Date;
}

const DEFAULT_UNTIL = "2099-12-31T00:00:00.000Z";

const parseArgs = (argv: string[]): ParsedArgs => {
  const valueOf = (flag: string) => {
    const index = argv.indexOf(flag);
    return index !== -1 ? argv[index + 1] : undefined;
  };
  const uid = valueOf("--uid");
  const plan = valueOf("--plan");
  const until = new Date(valueOf("--until") ?? DEFAULT_UNTIL);

  if (!uid) throw new Error("--uid <uid> 인자가 필요합니다");
  if (plan !== "premium" && plan !== "free") {
    throw new Error("--plan은 premium 또는 free여야 합니다");
  }
  if (Number.isNaN(until.getTime())) throw new Error("--until은 ISO 날짜여야 합니다");
  if (plan === "premium" && until.getTime() <= Date.now()) throw new Error("--until은 미래여야 합니다");
  return { uid, plan, until };
};

const run = async () => {
  const { uid, plan, until } = parseArgs(process.argv.slice(2));
  const isPremium = plan === "premium";
  const premiumUntil = isPremium ? until.toISOString() : null;
  const now = new Date().toISOString();

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const auth = getAuth();

  // uid 존재 여부를 먼저 확인한다 — 여기서 실패하면(오타 등) 문서를 쓰기 전에 중단된다.
  // 기존 커스텀 클레임도 함께 얻어 아래에서 병합한다.
  const { premium: _legacy, ...existingClaims } = (await auth.getUser(uid)).customClaims ?? {};

  // billing-proxy와 같은 순서(클레임 먼저)로 쓴다.
  await auth.setCustomUserClaims(uid, {
    ...existingClaims,
    premiumUntil: premiumUntil === null ? 0 : Math.floor(Date.parse(premiumUntil) / 1000),
  });
  console.log(`${uid} 커스텀 클레임 갱신 완료 (premiumUntil: ${premiumUntil ?? "없음"})`);

  await db.doc(`entitlements/${uid}`).set(
    {
      plan,
      status: isPremium ? "active" : "none",
      source: "manual",
      premiumUntil,
      cancelAt: null,
      updatedAt: now,
    },
    { merge: true },
  );
  console.log(`entitlements/${uid} 문서 갱신 완료 (plan: ${plan})`);

  console.log(
    "열려 있는 클라이언트는 문서 변경을 감지해 토큰을 바로 갱신한다. 닫혀 있던 클라이언트는 다음 로그인/토큰 갱신 때 반영된다.",
  );
};

run().catch((error) => {
  console.error("엔타이틀먼트 부여/회수 실패:", error);
  process.exit(1);
});
