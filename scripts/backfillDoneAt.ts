/**
 * 1회성 복구: done인데 doneAt이 없는(필드 없음·null 등) todos에 doneAt=updatedAt을 채운다.
 * 원인은 웹 editTodo가 상태 변경 시 doneAt을 기록하지 않던 버그(fix/web-done-at)다 —
 * **그 수정이 운영에 배포된 뒤에 실행**해야 다시 생기지 않는다. 대상 판정은 scripts/lib/doneAtAudit.ts.
 *
 * 안전장치
 * - 기본은 dry-run(개수만 출력). 실제로 쓰려면 --apply를 붙인다.
 * - doneAt 한 필드만 쓴다. updatedAt은 그대로 둔다(캘린더 동기화가 updatedAt으로 변경을 판단하므로
 *   건드리면 불필요한 재동기화가 생기고, 완료 시각의 근거 값이 사라진다).
 * - 읽은 시점의 문서 updateTime을 조건으로 걸어, 실행 중 사용자가 고친 문서는 덮어쓰지 않고 실패로 남긴다.
 * - 이미 doneAt이 정상인 문서는 대상이 아니므로 재실행해도 안전하다(멱등).
 *
 * 출력은 개수뿐이고 uid·제목은 출력하지 않는다.
 *
 * 사용법:
 *   GOOGLE_APPLICATION_CREDENTIALS=<키 경로> npm run backfill:done-at            # dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=<키 경로> npm run backfill:done-at -- --apply # 실제 쓰기
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, type Timestamp } from "firebase-admin/firestore";
import { AUDIT_FIELDS, planDoneAtBackfill, toAuditTodo } from "./lib/doneAtAudit";

const apply = process.argv.includes("--apply");

const run = async () => {
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  const snapshot = await db
    .collection("todos")
    .select(...AUDIT_FIELDS)
    .get();
  const updateTimeById = new Map<string, Timestamp>(snapshot.docs.map((d) => [d.id, d.updateTime]));
  const { writes, skipped } = planDoneAtBackfill(snapshot.docs.map((d) => toAuditTodo(d.id, d.data())));

  console.log(`전체 todos ${snapshot.size}개 중 백필 대상 ${writes.length}개, updatedAt도 없어 건너뜀 ${skipped.length}개`);

  if (!apply) {
    console.log("\ndry-run: 아무것도 쓰지 않았습니다. 실제로 쓰려면 -- --apply를 붙여 다시 실행하세요.");
    return;
  }
  if (writes.length === 0) {
    console.log("백필 대상 없음, 종료");
    return;
  }

  // 문서마다 따로 쓴다: updateTime 조건이 걸린 쓰기는 하나가 실패하면 batch 전체가 실패하므로,
  // 개별로 써서 바뀐 문서만 건너뛰게 한다. 대상이 수십 건 규모라 속도는 문제되지 않는다.
  let done = 0;
  let conflicted = 0;
  for (const { id, doneAt } of writes) {
    try {
      await db
        .collection("todos")
        .doc(id)
        .update({ doneAt }, { lastUpdateTime: updateTimeById.get(id)! });
      done += 1;
    } catch (error) {
      conflicted += 1;
      console.warn(`건너뜀(읽은 뒤 문서가 바뀜 또는 쓰기 실패): ${(error as { code?: unknown }).code ?? "unknown"}`);
    }
  }

  console.log(`\n백필 완료: ${done}개 기록, ${conflicted}개 건너뜀`);
  if (conflicted > 0) console.log("건너뛴 문서가 있으면 audit:done-at으로 다시 확인한 뒤 재실행하세요(멱등).");
};

run().catch((error) => {
  console.error("백필 실패:", error);
  process.exit(1);
});
