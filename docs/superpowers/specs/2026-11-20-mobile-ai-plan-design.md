# 모바일 AI 할 일 플랜 이식 설계

작성일: 2026-11-20 · 관련: `2026-09-25-ai-plan-design.md`(웹 원본), `2026-11-13-ai-plan-guard-design.md`(가드), `2026-11-14-ai-plan-goal-judgment-design.md`(목표 판단), `2026-11-18-mobile-iap-design.md`(앱 프리미엄)

## 왜 하는가

앱은 인앱결제(PR #188)로 구독을 팔 수 있게 됐지만, 구독해도 바뀌는 게 표시뿐이다. 사용자 결정으로 스토어 첫 출시에는 프리미엄 기능 3개(AI 플랜·구글 캘린더·인사이트)가 모두 들어가야 한다. 이 문서는 그중 첫 번째인 AI 플랜을 다룬다.

원칙(11-18 사용자): 같은 계정이면 웹과 앱 어디서나 똑같이 프리미엄이고, 웹과 앱의 간극을 최대한 없앤다. 그래서 동작·문구·저장 결과는 웹과 같게 하고, 화면만 폰에 맞게 새로 만든다.

## 목표

1. 앱 목록 탭에서 목표를 적으면 AI가 상위 할 일 1개와 하위 할 일 N개(날짜·우선순위 포함)를 제안하고, 미리보기에서 고친 뒤 한 번에 추가할 수 있다.
2. 웹과 앱의 동작이 갈라지지 않도록 화면이 아닌 로직(미리보기 편집, 요청·오류 형식, 오류 문구, 일괄 저장)은 `packages/core` 한 곳에 둔다.
3. 무료 사용자에게도 진입 버튼이 보이고, 누르면 잠금 안내와 구독 경로가 나온다(웹과 같은 3중 게이트).

## 비목표

- 서버(ai-proxy) 변경 없음. 프리미엄 확인, 하루 20회, 시도 상한 40, 연타 제한, NOT_A_GOAL/모델 목표 판단은 모두 서버가 이미 한다. 앱 요청은 Origin 헤더가 없지만 CORS 검사가 응답 헤더만 정하고 요청을 막지 않음을 확인했다(`ai-proxy/src/index.ts`).
- 자연어 빠른 추가 등 새 AI 기능.
- 모바일 Sentry 도입(앱에 Sentry가 아직 없다. 출시 전 권장 항목으로 따로 남아 있다). 이번에는 예상 못 한 오류를 `console.warn`으로만 남긴다.
- 웹 화면 변경. 웹은 가져오는 경로만 바뀐다.

## 안티골 (동작해도 실패로 보는 것)

- 웹과 앱에서 같은 오류에 다른 문구가 나오거나, 같은 계획을 저장했는데 정렬 순서·기본값이 다르게 저장된다.
- 생성 중에 화면을 벗어나 유료 사용 횟수 1회가 결과 없이 사라진다.
- 편집한 미리보기가 확인 없이 날아간다.
- 더블탭으로 계획이 두 번 생성되거나 두 번 저장된다.
- 앱에 웹 결제로 유도하는 문구·링크가 들어간다(Apple 3.1.1).

## 접근 방식

| 안 | 내용 | 대가 | 결정 |
|---|---|---|---|
| **1. 공용 로직을 core로 옮겨 웹·앱이 같이 씀** | planDraft 리듀서, 요청·응답 타입과 오류 코드, 오류 문구, 상위+하위 일괄 저장을 `packages/core`로 이동. 일반 저장(`createTodo`)과 반복 저장처럼 db·uid를 주입받는 형태 | 웹 import 경로가 바뀜(동작 불변, 기존 웹 테스트로 검증) | **채택(사용자 선택)**. 오류 코드·문구·저장 규칙이 한 곳이라 #174 같은 변경이 한 번에 반영된다 |
| 2. 앱에 복사 | 웹은 그대로 두고 앱에 같은 코드를 둔다 | 오류 코드·문구·저장 규칙이 두 벌로 갈라짐. 반복 기능 때 core로 합친 일을 되풀이 | 기각 |

화면 진입 방식도 두 안 중 골랐다.

| 안 | 내용 | 결정 |
|---|---|---|
| **A. 목록 탭 「할 일 추가」 옆 「AI로 계획」 버튼 → 스택 전체 화면** | 「할 일 추가」 화면과 같은 방식 | **채택(사용자 선택)**. 항목별 제목·날짜·우선순위 편집에 키보드·날짜 선택기가 덜 답답하다 |
| B. 아래에서 올라오는 시트 | 가벼워 보임 | 기각. 항목 5~8개면 스크롤·키보드가 부딪치고, 즉시 unmount 컨테이너 안 확인창이 같이 사라지는 기존 함정이 있다 |

서버 요청은 두 안과 무관하게 플랫폼별로 따로 둔다. 웹 `authorizedFetch`·Sentry 보고는 웹 전용이고, 앱은 기존 `verifyApi.ts`처럼 Firebase ID 토큰을 붙여 `fetch`한다. 응답을 해석하는 부분(오류 코드 판정)은 core 것을 쓴다.

## 설계

### 1. core로 옮기는 것 (`packages/core/src/aiPlan/`)

새 하위 경로 `@tododo/core/dist/aiPlan/index.js`로 내보낸다(웹이 entitlement·recurring을 가져오는 방식과 같다).

- **타입**: `PlanPriority`, `GeneratedPlanItem`, `GeneratedPlan`, `PlanUsage`, `GeneratePlanInput`, `GeneratePlanResult`, `AiPlanErrorCode`, `AiPlanError` 클래스, `isExpectedAiPlanError`. 웹 `client/src/features/aiPlan/api/aiProxyApi.ts`에서 이동.
- **응답 해석**: `parsePlanResponse(res: Response): Promise<GeneratePlanResult>`. ok면 JSON을 돌려주고, 아니면 본문 `error`를 알려진 코드로 바꿔 `AiPlanError`를 던진다(지금 `requestPlan`의 뒷부분). 웹·앱 요청 함수는 fetch만 다르게 하고 이 함수를 부른다.
- **미리보기 편집**: `planDraft.ts`의 리듀서·`EMPTY_DRAFT`·`checkedCount`·`canSubmit`·`toSubmission`과 관련 타입. React 훅(`usePlanDraft`)은 각 앱에 둔다(core는 React에 의존하지 않는다).
- **오류 문구**: `aiPlanErrorMessage`. 문구는 지금 웹과 같다.
- **일괄 저장**: `createPlanTodos(db, userId, submission)`. 웹 `todoApi.ts`의 `createPlanTodos`와 `getNextRootOrder`를 옮기고, 날짜 키→ISO 변환(로컬 자정, `parseLocalDateOnly` 방식)도 core에 둔다. 저장되는 필드·순서 규칙은 지금과 같다. `PlanSubmission`·`PlanTodoInput` 타입도 함께 옮긴다.
- **우선순위 라벨**: 웹 `priorityLabels`가 순수 상수면 core로 옮겨 공유한다(빌더 판단).

웹은 기존 파일이 core를 다시 내보내거나 가져오도록 바꾼다. 웹 Sentry 보고(`useGeneratePlan`, `useCreatePlanTodos`)는 웹에 남는다. **웹 기존 테스트(aiPlan, planTodoApi, useCreatePlanTodos)가 그대로 통과해야 한다.** core로 옮긴 순수 로직의 테스트는 core로 같이 옮긴다.

### 2. 앱 요청 (`mobile/src/aiPlan/`)

- `aiProxyApi.ts`: `EXPO_PUBLIC_AI_PROXY_URL` + `/plan`에 POST, `Authorization: Bearer <idToken>`. URL은 함수 안에서 읽는다(`verifyApi.ts`와 같은 이유: 테스트가 값을 바꿀 수 있게). 미설정이면 오류를 던진다. 네트워크 실패는 `AiPlanError("UNKNOWN")` 경로로 처리해 기본 문구("잠시 후 다시 시도해 주세요")가 나오게 한다.
- `useGeneratePlan`: TanStack Query `useMutation`. 예상 못 한 오류만 `console.warn`.
- `useCreatePlanTodos`: core `createPlanTodos(db, uid, submission)` 호출 → 성공 시 `["todos", uid]` 무효화. 반환값은 지금과 같다.
- **앱 로컬 알림은 예약하지 않는다(사용자 결정 11-20).** AI 플랜은 날짜만 있어 dueAt이 그날 로컬 0시로 저장된다. 앱 알림(`getReminderTrigger`)은 dueAt 시각에 그대로 울리므로, 예약하면 마감일마다 0시에 여러 개가 몰리고 오늘 항목은 예약조차 안 된다. 시각 입력(항목별 시각, 기본 시각 저장)도 검토했으나 과하다는 판단으로 뺐다. 사용자가 나중에 할 일 상세에서 시각을 정하면 그때 일반 할 일처럼 알림이 잡히는지는 계획 단계에서 앱 수정 경로(`useUpdateTodo`)를 확인해 적는다.
- 환경변수: `mobile/.env`(로컬)에 `EXPO_PUBLIC_AI_PROXY_URL` 추가, `.env.example`이 있으면 같이 추가. EAS env 등록은 출시 준비 목록(Task 8/제출 전)에 추가해야 한다.

### 3. 앱 화면

**진입**: `TodoListScreen`의 「할 일 추가」 버튼 옆에 「AI로 계획」 버튼. 무료 사용자에게도 보인다. 빈 상태 화면에는 넣지 않는다(빌더 판단, 웹도 빈 상태에는 없음 — 다르면 웹을 따른다).

**라우트**: `TodoListStack`에 `AiPlan` 화면 추가, 제목 "AI로 계획". 다른 탭 스택에는 넣지 않는다.

**화면 상태** (웹 `aiPlanModal.tsx`와 같은 흐름):

```
[잠금]  프리미엄이 아니거나(useIsPremium) 서버가 403 PREMIUM_REQUIRED를 줌
        "AI 할 일 플랜은 프리미엄 기능입니다"
        목표를 적으면 AI가 실행 단계와 날짜를 나눠 제안해요…
        [ 프리미엄 알아보기 ] → 같은 스택의 Account 화면(PremiumSection)

[목표]  목표 (1~200자)  [예: 다음 달 이사 준비      ]
        마감일(선택)     [날짜 선택]
        입력한 목표는 계획 생성을 위해 AI(Anthropic)로 전송돼요
                                   [ 계획 만들기 ]

[미리보기]  AI가 만든 계획                 오늘 3/20회
        상위  [이사 준비        ] [11/30] [보통]
        ☑ [짐 목록 만들기   ] [11/22] [높음] ✕
        ☑ [업체 견적 받기   ] [11/24] [보통] ✕
        + 항목 직접 추가
        [ 다시 만들기 ]                 [ 2개 추가 ]
```

- 잠금 버튼 문구·이동: 앱에는 웹의 `usePremiumCta`가 없으므로 계정 화면으로 보낸다. 웹 결제 유도 문구는 쓰지 않는다. 버튼 라벨은 빌더 판단(예: "구독 알아보기").
- 날짜·우선순위 입력은 기존 앱 컴포넌트(`DateField`, `PriorityChips`, `Checkbox`)를 쓴다. 날짜 최소값은 오늘.
- 목록이 길면 화면 전체를 스크롤하고, 키보드가 입력칸을 가리지 않게 한다(앱 TodoForm 화면의 처리 방식을 따른다).
- 생성 중: 버튼 "계획을 짜는 중…", 입력 비활성.
- 오류: core `aiPlanErrorMessage` 문구를 앱의 기존 알림 방식(TodoForm의 실패 처리와 같은 방식, `Alert` 등)으로 보여준다. PREMIUM_REQUIRED만 잠금 상태로 전환한다.
- 추가 성공: "할 일 N개를 추가했어요"를 알리고 목록으로 돌아간다. 실패: "추가하지 못했어요 / 잠시 후 다시 시도해 주세요", 화면에 머문다.

**이탈·중복 방지** (안티골 대응):

- 생성 요청 중에는 뒤로 가기(헤더 버튼·iOS 스와이프·Android 뒤로 키)를 막는다. React Navigation `beforeRemove`로 막고, 생성 중에는 제스처도 끈다.
- 미리보기를 고친 상태(`draft.dirty`)에서 나가려 하면 확인을 받는다: "수정한 내용이 사라져요 / 편집한 계획을 저장하지 않고 닫을까요?" [계속 편집]/[닫기]. 다시 만들기도 dirty면 "다시 만들면 편집한 계획이 새 결과로 바뀌고 사용 횟수가 1회 차감돼요." 확인. 문구는 웹과 같다.
- 확인창은 화면 안 자식 시트가 아니라 `Alert.alert` 같은 독립 대화상자로 띄운다(즉시 unmount 컨테이너 함정 회피).
- 생성·저장 모두 `useRef` 진행 중 플래그로 동기 더블탭을 막는다(웹과 같은 이유: `isPending`은 다음 렌더까지 반영이 늦다).
- 저장 성공으로 나갈 때는 확인 없이 나간다.

## 알고 감수하는 한계 (웹과 같음)

1. 하루 사용 카운터(KV)는 비원자적이라 병렬 요청으로 약간 넘을 수 있다.
2. 구독 직후 클레임 반영: 앱은 구독 상태가 바뀌면 ID 토큰을 강제 갱신한다(`useEntitlementSync`). 그래도 갱신 전 틈에 403이 오면 잠금 화면이 뜨고, 화면을 다시 열면 풀린다.
3. 기존 할 일·캘린더 일정을 보지 않아 바쁜 날을 피하지 못한다.
4. 앱에는 Sentry가 없어 예상 못 한 실패가 수집되지 않는다(모바일 Sentry 도입 시 연결).
5. 생성 중 앱을 백그라운드로 보내면 iOS가 JS를 멈춰 응답을 놓칠 수 있다. 서버는 이미 1회를 차감했으므로 결과 없이 횟수만 줄어든다. 화면 이탈 차단(`beforeRemove`)으로는 막을 수 없어 감수한다.
6. AI 할 일은 dueAt이 로컬 0시다. 웹 서버 알림(reminder-proxy)은 dueAt에서 사용자 설정만큼 앞당겨 보내므로, 웹에서 알림을 켠 사용자는 AI 할 일 알림을 전날 밤·자정 근처에 받을 수 있다. 이 문서 이전부터 있던 웹 문제이며 별도 할 일로 남긴다.

## 테스트

- core: 옮긴 리듀서·문구·응답 해석·`createPlanTodos` 테스트(웹 기존 테스트 이동 + 반환 id 추가분).
- 웹: 기존 aiPlan·todo 테스트 전부 그대로 통과. `VITE_FIREBASE_API_KEY= npx vitest run`으로 CI 등가 확인.
- 앱(jest): 요청 함수(URL 미설정·토큰 첨부·오류 코드 해석), 화면 상태 전환(잠금/목표/미리보기, 403→잠금), 생성 중 뒤로 가기 차단, dirty 이탈 확인, 더블탭 1회 호출, 저장 성공 시 목록 복귀, 알림 예약이 호출되지 않음.
- TZ 함정: 날짜 키 변환 테스트는 `TZ=America/New_York`으로도 돌린다.
- 수동: 시뮬레이터에서 무료(잠금→계정 화면)·프리미엄(생성→편집→추가→목록 반영)·로컬 ai-proxy(`wrangler dev`) 경유 실호출.

## 설계자가 정한 것 (사용자 확인 대상)

- 진입 버튼은 빈 상태 화면에는 넣지 않는다(웹과 다르면 웹을 따름).
- 잠금 화면 버튼은 같은 스택의 계정 화면으로 이동.
- 오류·확인창은 `Alert.alert` 계열 독립 대화상자.
- 예상 못 한 오류는 `console.warn`만.
- 백그라운드 이탈은 감수(한계 5).

## 빌더에게 맡기는 것

- 컴포넌트 분할·파일 이름(웹 구조 `planGoalStep`/`planPreviewStep`/`planItemRow`를 따라가면 좋다).
- 버튼·잠금 화면의 세부 스타일(앱 디자인 토큰 사용, 다크모드 대응).
- 웹 쪽이 core를 다시 내보낼지 직접 가져올지.
