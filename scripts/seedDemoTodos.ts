/**
 * App Store 스크린샷·심사용 **데모 계정 하나에만** 데모 할 일을 넣는다(docs/app-store/demo-data.md).
 * 넣는 내용은 scripts/lib/demoTodos.ts가 실행일(KST) 기준으로 계산한다. 반복 할 일 2개는 만들지 않는다
 * (앱에서 손으로 만든다).
 *
 * 안전장치
 * - --uid 필수. 그 uid의 Auth 이메일이 DEMO_SEED_ALLOWED_EMAILS(쉼표 구분) 안에 없으면 아무것도 하지 않는다.
 *   허용 목록은 저장소에 두지 않는다 — 실행할 때 환경변수로 넘긴다. 비어 있으면 거부한다.
 * - 기본은 dry-run(무엇을 할지 개수만 출력). 실제로 쓰려면 --apply.
 * - 그 uid에 이미 할 일이 있으면 중복을 막으려고 거부한다. 지우고 다시 넣으려면 --reset을 함께 준다.
 *   --reset은 `todos where userId == <uid>` 문서만 지운다(다른 사용자·다른 컬렉션은 건드리지 않는다).
 * - 출력에는 이메일·제목을 쓰지 않고 개수만 쓴다.
 *
 * 인증: 운영은 grantEntitlement와 같이 GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 키, Cloud Datastore User +
 * Firebase Admin SDK Administrator Service Agent 역할). 에뮬레이터는 FIRESTORE_EMULATOR_HOST와
 * FIREBASE_AUTH_EMULATOR_HOST를 설정하면 키 없이 그쪽으로 간다(GCLOUD_PROJECT로 프로젝트 id 지정).
 *
 * 사용법:
 *   DEMO_SEED_ALLOWED_EMAILS=<데모 계정 이메일> GOOGLE_APPLICATION_CREDENTIALS=<키 경로> \
 *     npm run seed:demo -- --uid <uid> [--reset] [--apply]
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type WriteBatch } from "firebase-admin/firestore";
import { buildDemoTodos, kstDateKey } from "./lib/demoTodos";

const argv = process.argv.slice(2);
const valueOf = (flag: string) => {
  const index = argv.indexOf(flag);
  return index !== -1 ? argv[index + 1] : undefined;
};

const uid = valueOf("--uid");
const reset = argv.includes("--reset");
const apply = argv.includes("--apply");
const allowedEmails = (process.env.DEMO_SEED_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

const run = async () => {
  if (!uid || uid.startsWith("--")) throw new Error("--uid <uid> 인자가 필요합니다");
  if (allowedEmails.length === 0) {
    throw new Error("DEMO_SEED_ALLOWED_EMAILS 환경변수(데모 계정 이메일, 쉼표 구분)가 필요합니다");
  }
  if (usingEmulator !== Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
    // 한쪽만 에뮬레이터면 운영 Auth로 허용 목록을 확인하고 에뮬레이터에 쓰는(또는 반대) 어긋남이 생긴다.
    throw new Error("FIRESTORE_EMULATOR_HOST와 FIREBASE_AUTH_EMULATOR_HOST는 함께 설정하거나 함께 비워야 합니다");
  }

  initializeApp(
    usingEmulator
      ? { projectId: process.env.GCLOUD_PROJECT ?? "tododo-83576" }
      : { credential: applicationDefault() },
  );
  const db = getFirestore();
  console.log(`대상: ${usingEmulator ? `에뮬레이터(${process.env.FIRESTORE_EMULATOR_HOST})` : "운영 Firebase"}`);

  // 허용 목록 확인 — uid 오타·다른 사람 uid면 여기서 멈춘다.
  const email = (await getAuth().getUser(uid)).email?.toLowerCase();
  if (!email || !allowedEmails.includes(email)) {
    throw new Error("이 uid의 이메일이 DEMO_SEED_ALLOWED_EMAILS에 없습니다 — 데모 계정이 아니면 시드하지 않습니다");
  }

  const existing = await db.collection("todos").where("userId", "==", uid).get();
  if (existing.size > 0 && !reset) {
    throw new Error(`이 계정에 이미 할 일 ${existing.size}개가 있습니다. 지우고 다시 넣으려면 --reset을 붙이세요`);
  }

  const now = new Date();
  const todos = buildDemoTodos({ uid, now, newId: () => db.collection("todos").doc().id });
  const doneCount = todos.filter((t) => t.data.status === "done").length;
  console.log(`실행일(KST) ${kstDateKey(now)} 기준`);
  console.log(`삭제 예정: ${reset ? existing.size : 0}개 / 생성 예정: ${todos.length}개(완료 ${doneCount}개)`);

  if (!apply) {
    console.log("\ndry-run: 아무것도 쓰지 않았습니다. 실제로 쓰려면 -- --apply를 붙여 다시 실행하세요.");
    return;
  }

  // 삭제와 생성을 나눠 커밋한다. 배치 한도(500)를 넘지 않게 끊는다.
  const commitInChunks = async (ops: Array<(batch: WriteBatch) => void>) => {
    for (let i = 0; i < ops.length; i += 400) {
      const batch = db.batch();
      ops.slice(i, i + 400).forEach((op) => op(batch));
      await batch.commit();
    }
  };

  if (reset && existing.size > 0) {
    await commitInChunks(existing.docs.map((d) => (batch) => batch.delete(d.ref)));
    console.log(`삭제 완료: ${existing.size}개`);
  }
  await commitInChunks(todos.map((t) => (batch) => batch.set(db.collection("todos").doc(t.id), t.data)));
  console.log(`생성 완료: ${todos.length}개`);
  console.log("다음: 앱에서 반복 할 일 2개를 손으로 만든다(docs/app-store/demo-data.md ★).");
};

run().catch((error) => {
  console.error("데모 시드 실패:", error instanceof Error ? error.message : error);
  process.exit(1);
});
