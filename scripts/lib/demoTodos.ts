/**
 * App Store 스크린샷용 데모 할 일 세트(docs/app-store/demo-data.md)를 순수 데이터로 만든다.
 * Firestore 쓰기는 scripts/seedDemoTodos.ts가 하고, 여기는 테스트할 수 있게 문서 내용만 계산한다.
 *
 * 문서 형식은 앱 작성 경로(web createTodo, core createPlanTodos·updateTodo)와 같다.
 * - dueAt/startAt/doneAt/createdAt/updatedAt은 `Date#toISOString()`(UTC "Z") 문자열.
 * - done이면 doneAt 필수, done이 아니면 doneAt null.
 * - 상위 할 일 상태는 하위 상태로 계산한 값(core calcParentStatus와 같은 규칙).
 * - 반복 할 일은 만들지 않는다(recurrence/recurrenceId는 항상 null) — 회차 생성 규칙을
 *   재구현하지 않도록 반복 2개는 앱에서 손으로 만든다.
 *
 * 날짜는 한국 시간(KST, UTC+9, 서머타임 없음) 기준으로 계산한다. 앱은 한국에서만 공개하고
 * 촬영 시뮬레이터도 KST라, 스크립트를 실행하는 기기의 시간대와 상관없이 같은 결과가 나와야 한다.
 */

type Status = "todo" | "doing" | "done";
type Priority = "low" | "medium" | "high";

export interface DemoTodoDoc {
  userId: string;
  title: string;
  priority: Priority;
  status: Status;
  startAt: string | null;
  dueAt: string | null;
  doneAt: string | null;
  parentId: string | null;
  order: number;
  archived: false;
  recurrence: null;
  recurrenceId: null;
  createdAt: string;
  updatedAt: string;
}

export interface DemoTodo {
  id: string;
  data: DemoTodoDoc;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** now가 속한 KST 날짜("yyyy-MM-dd"). */
export const kstDateKey = (now: Date): string => new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

/** KST 날짜 키에 일수를 더한다. 키를 UTC 자정으로 보고 계산하므로 실행 기기 시간대와 무관하다. */
const addDays = (key: string, days: number): string =>
  new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** KST 날짜 + "HH:mm" → UTC ISO 문자열. */
export const kstToISO = (key: string, time: string): string => new Date(`${key}T${time}:00+09:00`).toISOString();

/** 시드 고정 PRNG(mulberry32) — 실행할 때마다 통계 모양이 바뀌지 않게 한다. */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** core calcParentStatus와 같은 규칙(상태만). 테스트에서 core 구현과 일치하는지 확인한다. */
const parentStatusOf = (children: Status[]): Status => {
  if (children.every((s) => s === "done")) return "done";
  if (children.some((s) => s !== "todo")) return "doing";
  return "todo";
};

interface ChildSpec {
  title: string;
  /** D 기준 마감일 오프셋 */
  dueDay: number;
  status: Status;
  /** done일 때 완료일 오프셋(D 기준, 0이면 실행 시각) */
  doneDay?: number;
}

interface ProjectSpec {
  title: string;
  priority: Priority;
  dueDay: number;
  children: ChildSpec[];
}

interface TodaySpec {
  title: string;
  priority: Priority;
  time: string;
  status: Status;
}

/** ★ 반복 2개(아침 스트레칭·영어 단어)는 앱에서 손으로 만든다 — demo-data.md §1. */
const TODAY: TodaySpec[] = [
  { title: "팀 주간 회의 자료 정리", priority: "high", time: "10:00", status: "doing" },
  { title: "운동 — 러닝 5km", priority: "medium", time: "19:00", status: "todo" },
  { title: "장보기 (우유, 달걀, 사과)", priority: "low", time: "18:00", status: "done" },
  { title: "디자인 시안 피드백 회신", priority: "high", time: "17:00", status: "todo" },
];

const PROJECTS: ProjectSpec[] = [
  {
    title: "포트폴리오 사이트 완성",
    priority: "high",
    dueDay: 21,
    children: [
      { title: "레퍼런스 조사", dueDay: -6, status: "done", doneDay: -6 },
      { title: "와이어프레임", dueDay: -2, status: "done", doneDay: -2 },
      { title: "메인 페이지 디자인", dueDay: 3, status: "doing" },
      { title: "프로젝트 소개 글 작성", dueDay: 7, status: "todo" },
      { title: "배포", dueDay: 20, status: "todo" },
    ],
  },
  {
    title: "이사 준비",
    priority: "medium",
    dueDay: 14,
    children: [
      { title: "이삿짐센터 견적 비교", dueDay: -3, status: "done", doneDay: -4 },
      { title: "전입신고", dueDay: 15, status: "todo" },
      { title: "인터넷 이전 신청", dueDay: 5, status: "todo" },
      { title: "버릴 짐 정리", dueDay: 2, status: "todo" },
    ],
  },
  {
    title: "제주도 여행 계획",
    priority: "low",
    dueDay: 30,
    children: [
      { title: "항공권 예매", dueDay: -1, status: "done", doneDay: -1 },
      { title: "숙소 예약", dueDay: 4, status: "todo" },
      { title: "일정표 만들기", dueDay: 10, status: "todo" },
    ],
  },
];

/** 통계용 지난 완료 기록 제목. 우선순위는 따로 3:5:2로 섞는다. */
const HISTORY_TITLES = [
  "주간 보고서 제출",
  "메일함 정리",
  "독서 30분",
  "빨래 개기",
  "은행 업무 보기",
  "치과 예약 전화",
  "분리수거",
  "블로그 글 초안 쓰기",
  "회의록 공유",
  "헬스장 가기",
  "택배 반품 접수",
  "관리비 납부",
  "사진 백업",
  "코드 리뷰 반영",
  "부모님께 안부 전화",
  "책상 정리",
  "영양제 주문",
  "강의 1개 듣기",
  "명함 정리",
  "화분 물 주기",
];

/** 하루 완료 개수: 평소 0~2, 최근 7일은 연속 달성이 보이게 1~3 → 합계 약 35개. */
const HISTORY_DAYS = 28;
const STREAK_DAYS = 7;
const HISTORY_SEED = 20261123;

const PRIORITY_BAG: Priority[] = ["high", "high", "high", "medium", "medium", "medium", "medium", "medium", "low", "low"];

export interface BuildOptions {
  uid: string;
  now: Date;
  /** 문서 id 생성기. 운영 스크립트는 Firestore 자동 id를 쓴다. */
  newId: () => string;
}

export const buildDemoTodos = ({ uid, now, newId }: BuildOptions): DemoTodo[] => {
  const D = kstDateKey(now);
  const nowISO = now.toISOString();
  const at = (day: number, time: string) => kstToISO(addDays(D, day), time);
  const result: DemoTodo[] = [];
  let rootOrder = 0;

  const base = {
    userId: uid,
    startAt: null,
    archived: false as const,
    recurrence: null,
    recurrenceId: null,
  };

  // 1. 오늘 화면
  for (const spec of TODAY) {
    const createdAt = at(-1, "21:00");
    const doneAt = spec.status === "done" ? nowISO : null;
    result.push({
      id: newId(),
      data: {
        ...base,
        title: spec.title,
        priority: spec.priority,
        status: spec.status,
        dueAt: at(0, spec.time),
        doneAt,
        parentId: null,
        order: rootOrder++,
        createdAt,
        updatedAt: spec.status === "todo" ? createdAt : nowISO,
      },
    });
  }

  // 2. 목록 — 하위 할 일이 있는 큰 일
  for (const project of PROJECTS) {
    const parentId = newId();
    const createdAt = at(-10, "20:00");
    const children = project.children.map((child, index) => {
      const doneAt = child.status === "done" ? at(child.doneDay ?? 0, "20:30") : null;
      return {
        id: newId(),
        data: {
          ...base,
          title: child.title,
          priority: project.priority,
          status: child.status,
          dueAt: at(child.dueDay, "18:00"),
          doneAt,
          parentId,
          order: index,
          createdAt,
          updatedAt: doneAt ?? (child.status === "doing" ? at(-1, "22:00") : createdAt),
        },
      };
    });
    const status = parentStatusOf(project.children.map((c) => c.status));
    const latestChildUpdate = children.map((c) => c.data.updatedAt).sort().at(-1) ?? createdAt;
    result.push({
      id: parentId,
      data: {
        ...base,
        title: project.title,
        priority: project.priority,
        status,
        dueAt: at(project.dueDay, "18:00"),
        doneAt: status === "done" ? latestChildUpdate : null,
        parentId: null,
        order: rootOrder++,
        createdAt,
        updatedAt: latestChildUpdate,
      },
    });
    result.push(...children);
  }

  // 5. 통계 — D-28 ~ D-1 완료 기록. 30일 아카이빙 대상이 되지 않게 D-28 이내로만.
  const random = mulberry32(HISTORY_SEED);
  let titleIndex = 0;
  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo -= 1) {
    const min = daysAgo <= STREAK_DAYS ? 1 : 0;
    const count = min + Math.floor(random() * 3);
    for (let i = 0; i < count; i += 1) {
      const title = HISTORY_TITLES[titleIndex % HISTORY_TITLES.length];
      titleIndex += 1;
      const priority = PRIORITY_BAG[Math.floor(random() * PRIORITY_BAG.length)];
      const hour = 9 + i * 4 + Math.floor(random() * 3); // 09~11, 13~15, 17~19시
      const doneAt = at(-daysAgo, `${String(hour).padStart(2, "0")}:${random() < 0.5 ? "10" : "40"}`);
      // 대부분 마감 안에 끝내고, 5개 중 1개꼴로 마감을 넘긴다(기한 준수율이 100%로 보이지 않게).
      const late = random() < 0.2;
      const dueAt = late ? at(-daysAgo, `${String(hour - 1).padStart(2, "0")}:00`) : at(-daysAgo, "21:00");
      result.push({
        id: newId(),
        data: {
          ...base,
          title,
          priority,
          status: "done",
          dueAt,
          doneAt,
          parentId: null,
          order: rootOrder++,
          createdAt: at(-daysAgo - 2, "21:00"),
          updatedAt: doneAt,
        },
      });
    }
  }

  return result;
};
