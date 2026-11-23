/**
 * 읽기 전용 점검: 운영 todos 중 "완료(done)인데 doneAt이 없는" 문서의 규모와 성격을 센다.
 * 판정 로직은 scripts/lib/doneAtAudit.ts 참고. 이런 문서는 통계의 완료 추이·스트릭·기한 준수율에서 빠진다.
 *
 * 이 스크립트는 **아무것도 쓰지 않는다**(set/update/delete/batch 호출 없음). 판정에 필요한 필드만
 * select하므로 할 일 제목·설명은 내려받지 않는다. 출력은 개수·월별 분포만이고, 문서 id는 --show-ids를
 * 줄 때만 출력한다(사용자 uid는 어떤 경우에도 출력하지 않는다).
 *
 * 비용: todos 문서 수만큼 Firestore 읽기가 발생한다(1회 전체 조회).
 *
 * 서비스 계정 키는 **저장소 밖**에 두고 경로만 넘긴다. 점검이 끝나면 키를 지우거나 콘솔에서 폐기하는 것을 권장한다.
 *
 * 사용법:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/keys/tododo-sa.json npm run audit:done-at
 *   GOOGLE_APPLICATION_CREDENTIALS=~/keys/tododo-sa.json npm run audit:done-at -- --show-ids
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { AUDIT_FIELDS, auditDoneAt, toAuditTodo } from "./lib/doneAtAudit";

const showIds = process.argv.includes("--show-ids");

const STATE_LABEL: Record<string, string> = {
  missing: "필드 없음",
  null: "null",
  empty: "빈 문자열",
  nonString: "문자열 아님(Timestamp 등)",
  invalid: "날짜로 못 읽음",
};

const printDistribution = (title: string, entries: [string, number][]) => {
  console.log(`   ${title}`);
  if (entries.length === 0) console.log("     (없음)");
  entries.forEach(([key, n]) => console.log(`     ${key.padEnd(10)} ${n}`));
};

const run = async () => {
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  const snapshot = await db
    .collection("todos")
    .select(...AUDIT_FIELDS)
    .get();
  const report = auditDoneAt(snapshot.docs.map((d) => toAuditTodo(d.id, d.data())));
  const { broken, users } = report;

  console.log(`전체 todos 문서: ${report.totalTodos}개, 그중 done: ${report.doneTodos}개\n`);

  console.log("① done인데 doneAt이 정상이 아닌 문서");
  console.log(`   합계                     ${broken.total}`);
  broken.byState.forEach(([state, n]) => console.log(`   └ ${(STATE_LABEL[state] ?? state).padEnd(22)} ${n}`));
  console.log(`   상위(루트) / 하위          ${broken.roots} / ${broken.children}`);
  console.log(`   반복 회차                  ${broken.recurring}`);
  console.log(`   보관됨(archived)           ${broken.archived}`);
  console.log(`   updatedAt이 정상인 문서     ${broken.withValidUpdatedAt}\n`);

  console.log("② 시기 분포 (UTC 월)");
  printDistribution("만들어진 달(createdAt)", broken.byCreatedMonth);
  printDistribution("마지막 수정 달(updatedAt)", broken.byUpdatedMonth);
  console.log("");

  console.log("③ 사용자");
  console.log(`   done이 있는 사용자          ${users.withDone}`);
  console.log(`   영향받은 사용자              ${users.affected}`);
  console.log(`   └ done 전부가 깨짐           ${users.allDoneBroken}`);
  console.log(`   └ done 절반 이상이 깨짐       ${users.halfOrMoreBroken}\n`);

  if (showIds) {
    console.log("--show-ids: 문서 id (제목·uid는 출력하지 않음)");
    console.log(`   ${broken.ids.join(", ") || "(없음)"}`);
  } else if (broken.total > 0) {
    console.log("문서 id가 필요하면 --show-ids를 붙여 다시 실행하세요.");
  }

  console.log("\n읽기 전용 점검 완료 — 데이터는 변경하지 않았습니다.");
};

run().catch((error) => {
  console.error("점검 실패:", error);
  process.exit(1);
});
