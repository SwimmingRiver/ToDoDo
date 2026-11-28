/**
 * 1회성 백필: 체험을 이미 쓴 사용자의 entitlements 문서에 "체험 당시 로그인 계정 키"(trialIdentities)를 채운다.
 * billing-proxy 수정(fix/trial-identity-keys-at-grant)이 **운영에 배포된 뒤**, 4판 처리방침이 시행되는
 * **2026-12-28 00:00(KST) 이후 되도록 빨리** 실행한다. 판정 로직은 scripts/lib/trialIdentityBackfill.ts.
 * - 배포 전에 쓰면 옛 Worker의 정규화가 모르는 필드를 지워, 다음 웹훅 쓰기에서 백필 값이 사라진다.
 * - 시행 전에는 회원의 로그인 계정 키를 모으지 않기로 했다(Worker도 같은 시각부터 남긴다). 그래서 --apply는 시행 시각
 *   전이면 거부한다. 시행 시각부터 백필 완료까지 몇 시간은 "연결을 끊고 바로 탈퇴"하면 빠질 수 있는 틈이 남는다.
 *
 * 왜 필요한가: 탈퇴 때 체험 기록은 "저장해 둔 키 ∪ 탈퇴 토큰의 키"로 남는다. 시행 전에 체험한 사용자는 저장된 키가 없어,
 * 탈퇴 직전에 로그인 계정 연결을 끊으면 여전히 기록을 피할 수 있다. 지금 연결된 Google·Apple 계정으로 키를 채워 그 틈을 닫는다.
 *
 * 안전장치
 * - 기본은 dry-run(개수만 출력). 실제로 쓰려면 --apply를 붙인다.
 * - trialIdentities 한 필드만 쓴다. 이미 있는 키는 보존한다(합집합). 재실행해도 안전하다(멱등).
 * - 읽은 시점의 문서 updateTime을 조건으로 걸어, 그사이 웹훅·체험이 문서를 바꿨으면 덮어쓰지 않고 건너뛴다.
 * - 시크릿 대조: Worker가 이미 남긴 키가 있으면 입력한 시크릿으로 다시 만들어 보고, 하나도 안 맞으면 중단한다.
 *   대조할 기록이 없거나 하나뿐인데 안 맞으면(시행 직후라 Worker 기록이 거의 없음) --apply에 --secret-confirmed를 함께 붙여야 쓴다 —
 *   틀린 시크릿으로 쓰면 아무 경고 없이 쓸모없는 키가 남기 때문이다.
 * - 출력은 개수뿐이다. uid·키·시크릿은 출력하지 않는다.
 *
 * 필요한 것
 * - GOOGLE_APPLICATION_CREDENTIALS: 서비스 계정 키 파일 경로(grantEntitlement.ts와 같은 계정·역할 —
 *   Firebase Admin SDK Administrator Service Agent + Cloud Datastore User).
 * - TRIAL_HMAC_SECRET: billing-proxy 운영 Worker에 등록한 값과 **똑같은** 값. wrangler로는 값을 다시 꺼낼 수 없으니
 *   등록할 때 보관한 값을 쓴다. 셸 기록에 남지 않게 `read -s TRIAL_HMAC_SECRET; export TRIAL_HMAC_SECRET`로 넣는다.
 *
 * 사용법:
 *   npm run build -w packages/core   # 또는 (cd packages/core && npm run build) — dist의 normalize를 쓴다
 *   GOOGLE_APPLICATION_CREDENTIALS=<키 경로> npm run backfill:trial-identities                                   # dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=<키 경로> npm run backfill:trial-identities -- --apply [--secret-confirmed]   # 실제 쓰기
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Timestamp } from "firebase-admin/firestore";
import { normalizeEntitlement } from "../packages/core/dist/entitlement/index.js";
import { canApplyBackfillAt, planTrialIdentityBackfill, type BackfillDoc, type ProviderInfo } from "./lib/trialIdentityBackfill";

const apply = process.argv.includes("--apply");
const secretConfirmed = process.argv.includes("--secret-confirmed");
/** auth.getUsers 한 번에 조회할 수 있는 최대 개수. */
const AUTH_BATCH = 100;

const run = async () => {
  const secret = process.env.TRIAL_HMAC_SECRET ?? "";
  if (secret === "") throw new Error("TRIAL_HMAC_SECRET 환경변수가 필요합니다(운영 billing-proxy와 같은 값)");

  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const auth = getAuth();

  const snapshot = await db.collection("entitlements").get();
  const updateTimeByUid = new Map<string, Timestamp>(snapshot.docs.map((d) => [d.id, d.updateTime]));
  const docs: BackfillDoc[] = snapshot.docs.map((d) => {
    const doc = normalizeEntitlement(d.data());
    return { uid: d.id, trialUsedAt: doc.trialUsedAt, trialIdentities: doc.trialIdentities };
  });

  const trialedUids = docs.filter((d) => d.trialUsedAt !== null).map((d) => d.uid);
  const providersByUid = new Map<string, ProviderInfo[] | null>(trialedUids.map((uid) => [uid, null]));
  for (let i = 0; i < trialedUids.length; i += AUTH_BATCH) {
    const { users } = await auth.getUsers(trialedUids.slice(i, i + AUTH_BATCH).map((uid) => ({ uid })));
    for (const user of users) {
      providersByUid.set(user.uid, user.providerData.map((p) => ({ providerId: p.providerId, uid: p.uid })));
    }
  }

  const plan = planTrialIdentityBackfill({ secret, docs, providersByUid });
  const { trialed, alreadyComplete, noIdentity, userMissing } = plan.counts;
  console.log(
    `entitlements ${snapshot.size}개 중 체험 사용 ${trialed}개: 백필 대상 ${plan.writes.length}개, ` +
      `이미 채워짐 ${alreadyComplete}개, Google·Apple 연결 없음 ${noIdentity}개, Auth에 없음 ${userMissing}개`,
  );

  if (plan.secretCheck === "mismatch") {
    console.error("\n중단: Worker가 남긴 키가 입력한 TRIAL_HMAC_SECRET으로 만들어지지 않습니다. 운영 값과 같은지 확인하세요.");
    process.exit(1);
  }
  console.log(
    plan.secretCheck === "verified"
      ? "시크릿 대조: Worker가 남긴 키와 일치합니다."
      : "시크릿 대조: 대조할 Worker 기록이 없어 확인하지 못했습니다. 운영 값과 같은지 직접 확인한 뒤 --secret-confirmed를 붙이세요.",
  );

  if (!apply) {
    console.log("\ndry-run: 아무것도 쓰지 않았습니다. 실제로 쓰려면 -- --apply를 붙여 다시 실행하세요.");
    return;
  }
  if (!canApplyBackfillAt(new Date())) {
    console.error("\n중단: 실제 쓰기는 4판 처리방침 시행(2026-12-28 00:00 KST)부터 할 수 있습니다. 그 전에는 dry-run만 됩니다.");
    process.exit(1);
  }
  if (plan.secretCheck === "unverifiable" && !secretConfirmed) {
    console.error("\n중단: 시크릿을 대조하지 못했습니다. 운영 값과 같음을 확인했다면 --secret-confirmed를 함께 붙이세요.");
    process.exit(1);
  }
  if (plan.writes.length === 0) {
    console.log("백필 대상 없음, 종료");
    return;
  }

  // 문서마다 따로 쓴다: updateTime 조건이 걸린 쓰기는 하나가 실패하면 batch 전체가 실패하므로.
  let done = 0;
  let conflicted = 0;
  for (const { uid, trialIdentities } of plan.writes) {
    try {
      await db
        .collection("entitlements")
        .doc(uid)
        .update({ trialIdentities }, { lastUpdateTime: updateTimeByUid.get(uid)! });
      done += 1;
    } catch (error) {
      conflicted += 1;
      console.warn(`건너뜀(읽은 뒤 문서가 바뀜 또는 쓰기 실패): ${(error as { code?: unknown }).code ?? "unknown"}`);
    }
  }
  console.log(`\n백필 완료: ${done}개 기록, ${conflicted}개 건너뜀`);
  if (conflicted > 0) console.log("건너뛴 문서가 있으면 dry-run으로 다시 확인한 뒤 재실행하세요(멱등).");
};

run().catch((error) => {
  console.error("백필 실패:", error instanceof Error ? error.message : error);
  process.exit(1);
});
