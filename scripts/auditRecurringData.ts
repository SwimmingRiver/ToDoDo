/**
 * 읽기 전용 점검: 운영 todos에 남아 있는 ① 고아 하위 할 일 ② 공유된 구글 일정 id 개수를 센다.
 * 판정 로직과 배경은 scripts/lib/recurringAudit.ts, docs/data-model/recurring-todos.md(G4) 참고.
 *
 * 이 스크립트는 **아무것도 쓰지 않는다**(set/update/delete/batch 호출 없음). 읽는 필드도
 * 판정에 필요한 것만 select하므로 할 일 제목·설명은 내려받지 않는다. 출력은 개수만이고,
 * 문서 id는 --show-ids를 줄 때만 출력한다(사용자 uid는 어떤 경우에도 출력하지 않는다).
 *
 * 비용: todos 문서 수만큼 Firestore 읽기가 발생한다(1회 전체 조회).
 *
 * 서비스 계정 키는 **저장소 밖**에 두고 경로만 넘긴다(Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 >
 * 새 비공개 키 생성). 점검이 끝나면 키를 지우거나 콘솔에서 폐기하는 것을 권장한다.
 *
 * 사용법:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/keys/tododo-sa.json npm run audit:recurring
 *   GOOGLE_APPLICATION_CREDENTIALS=~/keys/tododo-sa.json npm run audit:recurring -- --show-ids
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { AUDIT_FIELDS, auditTodos, toAuditTodo } from "./lib/recurringAudit";

const showIds = process.argv.includes("--show-ids");

const run = async () => {
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  const snapshot = await db
    .collection("todos")
    .select(...AUDIT_FIELDS)
    .get();
  const report = auditTodos(snapshot.docs.map((d) => toAuditTodo(d.id, d.data())));
  const { orphans, sharedEvents } = report;

  console.log(`전체 todos 문서: ${report.totalTodos}개\n`);

  console.log("① 고아 하위 할 일 (parentId가 가리키는 문서 없음)");
  console.log(`   합계                          ${orphans.total}`);
  console.log(`   └ 캘린더 동기화 대상(마감 있음·보관 안 됨) ${orphans.calendarEligible}`);
  console.log(`   └ 이미 구글 일정과 연결됨        ${orphans.withGoogleEventId}`);
  console.log(`   부모가 다른 사용자 소유(정상이면 0) ${orphans.parentOwnedByOtherUser}\n`);

  console.log("② 공유된 구글 일정 id (한 사용자의 여러 문서가 같은 googleEventId)");
  console.log(`   그룹 수                       ${sharedEvents.groups}`);
  console.log(`   └ 같은 반복 시리즈 안(#167 이전 복사 추정) ${sharedEvents.sameSeriesGroups}`);
  console.log(`   └ 그 밖                        ${sharedEvents.otherGroups}`);
  console.log(`   관련 문서 수                   ${sharedEvents.todos}\n`);

  if (showIds) {
    console.log("--show-ids: 문서 id (제목·uid는 출력하지 않음)");
    console.log(`   고아 하위 할 일: ${orphans.orphanIds.join(", ") || "(없음)"}`);
    sharedEvents.details.forEach((g, i) => {
      console.log(`   공유 그룹 ${i + 1}${g.sameSeries ? " [같은 시리즈]" : ""}: ${g.todoIds.join(", ")}`);
    });
  } else if (orphans.total + sharedEvents.groups > 0) {
    console.log("문서 id가 필요하면 --show-ids를 붙여 다시 실행하세요.");
  }

  console.log("\n읽기 전용 점검 완료 — 데이터는 변경하지 않았습니다.");
};

run().catch((error) => {
  console.error("점검 실패:", error);
  process.exit(1);
});
