/**
 * 1회성 마이그레이션: todos 컬렉션에서 archived 필드가 없는 문서에만 archived: false를 채운다.
 * 이미 필드가 있는 문서는 건드리지 않으므로 재실행해도 안전하다(멱등).
 *
 * 실행 전 GOOGLE_APPLICATION_CREDENTIALS 환경변수에 서비스 계정 키 파일 경로를 설정해야 한다.
 * (Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성)
 *
 * 사용법:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run backfill:archived -- --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run backfill:archived
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const isDryRun = process.argv.includes("--dry-run");
const BATCH_SIZE = 400; // Firestore batch 쓰기 상한(500) 아래 여유

const run = async () => {
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  const snapshot = await db.collection("todos").get();
  const needsBackfill = snapshot.docs.filter((doc) => doc.data().archived === undefined);

  console.log(`전체 문서 ${snapshot.size}개 중 백필 대상 ${needsBackfill.length}개`);

  if (isDryRun) {
    console.log("--dry-run 모드: 실제 쓰기는 수행하지 않음");
    return;
  }

  if (needsBackfill.length === 0) {
    console.log("백필 대상 없음, 종료");
    return;
  }

  for (let i = 0; i < needsBackfill.length; i += BATCH_SIZE) {
    const chunk = needsBackfill.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((doc) => {
      batch.update(doc.ref, { archived: false });
    });
    await batch.commit();
    console.log(`${i + chunk.length}/${needsBackfill.length} 완료`);
  }

  console.log("백필 완료");
};

run().catch((error) => {
  console.error("백필 실패:", error);
  process.exit(1);
});
