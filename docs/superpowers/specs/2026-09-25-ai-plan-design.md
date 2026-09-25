# AI 할 일 플랜 생성 — 설계

## Context

2026-09-20 로드맵(프리미엄 → 모바일 웹격차 → 스토어 심사)의 프리미엄 조각은 (1) 통계 시각화 확장, (2) AI 할 일 플랜 생성, (3) 결제/구독이다. (1)은 PR #127로 끝났고 09-25 릴리스(PR #129)로 main에 배포됐다. 이 스펙은 **(2)만** 다룬다.

사용자가 목표 한 문장("다음 달 이사 준비")을 입력하면 AI가 상위 할 일 1개와 하위 할 일 여러 개, 날짜와 우선순위를 제안한다. 사용자가 이 제안을 미리보기에서 고친 뒤 한 번에 추가한다.

현재 상태(2026-09-25 조사):

- AI 연동 코드가 전혀 없다. LLM API 키를 브라우저에 둘 수 없으므로 서버 경유가 필수다.
- 서버 역할은 Cloudflare Worker `calendar-proxy` 하나뿐이다. 이 Worker에 Firebase ID 토큰 검증(`src/auth.ts`의 `verifyFirebaseIdToken`), CORS origin 검사(`src/corsOrigin.ts`의 `isAllowedOrigin`), `premium` 커스텀 클레임 게이트(`403 PREMIUM_REQUIRED`)가 있다.
- 프리미엄 판정은 `entitlements/{uid}` 문서와 커스텀 클레임 `premium`이다. `npm run grant:entitlement`로 수동 부여하며, 결제 인프라는 없다.
- 레포는 npm workspaces를 쓰지 않는다. `client`·`mobile`은 `"@tododo/core": "file:../packages/core"`로 연결한다.
- 하위 할 일은 `parentId` 한 단계다(`packages/core/src/types/todo.ts`).

## 확정한 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 과금 | **유료(프리미엄 클레임 게이트)** | 사용자 확정(09-25). 08-30 PM의 "무료 선출시" 권고는 채택하지 않음. 결제는 (3)에서 붙인다 |
| 기능 형태 | 목표 → 상위 1 + 하위 N 분해 + 날짜·우선순위 제안 | 기존 `parentId` 모델과 그대로 맞음 |
| AI 입력 | 목표 문장 + (선택) 마감일 + 오늘 날짜만 | 기존 할 일 데이터를 외부 AI로 보내지 않음. 개인정보 부담과 토큰 비용이 최소 |
| 적용 방식 | 미리보기에서 편집 후 일괄 추가 | AI 실수가 데이터에 바로 들어가지 않음 |
| 진입점 | 목록 화면 "할 일 추가" 옆 "AI로 계획" 버튼 | 상위/하위 구조가 가장 잘 보이는 화면 한 곳 |
| 사용 한도 | 하루 20회(설정값), 서버에서 uid별 카운트 | 남용·비용 상한 |
| 서버 구조 | **새 Worker `ai-proxy`** + 인증을 **`packages/worker-auth`**로 추출해 공유 | 아래 §1 |
| 모델 | Claude Haiku 4.5(`claude-haiku-4-5`), wrangler var로 교체 가능 | 사용자 확정. 가장 싸고 빠르며 structured outputs 지원 |
| 플랫폼 | 웹만. 모바일(RN)은 로드맵 2단계 | |

범위 밖(후속):

- 자연어 빠른 추가("금요일까지 보고서, 내일 치과" → 여러 할 일). 필요해지면 같은 `ai-proxy`에 엔드포인트를 추가한다. Worker를 새로 만들지 않는다.
- 결제/구독, 모바일 이식, 기존 할 일·구글 캘린더 일정을 참고한 배치.

## 1. 구조

```
packages/
  core/            (기존) 웹·앱 공용 로직
  worker-auth/     (신규) Worker 공용 인증
    ├ verifyFirebaseIdToken   ← calendar-proxy/src/auth.ts에서 이동
    └ isAllowedOrigin         ← calendar-proxy/src/corsOrigin.ts에서 이동

calendar-proxy/    (기존, 동작 변화 없음) 인증 import만 worker-auth로 교체
ai-proxy/          (신규) POST /plan
```

**Worker를 나누는 이유.** 관심사 분리 자체는 Worker 하나 안에서도 모듈로 할 수 있다. 배포 단위까지 나누는 근거는 두 기능의 운영 특성이 다르다는 점이다.

| | calendar-proxy | ai-proxy |
|---|---|---|
| 시크릿 | Google OAuth client secret, refresh token | Anthropic API 키 |
| 호출 특성 | 빠르고 잦은 동기화 | 느리고(수 초) 비싼 호출 |
| 장애 영향 | 데이터 불일치 | "다시 시도"로 끝 |
| 변경 빈도 | 안정화 단계 | 프롬프트 튜닝으로 잦음 |

나누면 AI를 배포할 때 캘린더 연동을 다시 배포하지 않고, 한쪽 버그가 다른 쪽 시크릿을 노출하지 않는다. 나누는 기준은 "기능마다"가 아니라 **시크릿·장애·배포 주기가 다른가**다. Worker를 기능 수만큼 늘리지 않는다.

**인증을 공용 패키지로 빼는 이유.** "토큰 검증 + 권한 확인"은 두 기능 어디에도 속하지 않는 독립 관심사다. 보안 코드를 복제하면 나중에 한쪽만 고쳐지는 사고가 난다.

**`packages/worker-auth` 형태.**

- TS 소스 그대로 두고 **dist를 커밋하지 않는다**. 두 Worker 모두 wrangler(esbuild)가 번들할 때 TS를 직접 묶는다. core처럼 "dist가 최신인지 CI 검증"하는 부담이 생기지 않는다.
- `file:../packages/worker-auth`로 연결한다(기존 `@tododo/core` 관례).
- 관련 테스트(`calendar-proxy/src/__tests__/auth.test.ts` 등)도 함께 옮긴다.
- 옮긴 뒤 calendar-proxy의 기존 테스트가 **전부 그대로 통과**해야 한다. 이것이 동작 무변화의 증거다.

## 2. ai-proxy 요청 처리

`POST /plan` 처리 순서:

1. CORS origin 확인 → ID 토큰 검증 → `premium` 클레임 확인. 아니면 `403 PREMIUM_REQUIRED`(calendar-proxy와 같은 규약).
2. 입력 검증. 실패하면 `400 INVALID_INPUT`.
   - `goal`: 앞뒤 공백 제거 후 1~200자
   - `dueDate`: 선택, `YYYY-MM-DD`
   - `today`: `YYYY-MM-DD`
   - `dueDate`가 있으면 `today` 이상
3. 하루 한도 확인. KV 키는 `usage:{uid}:{YYYY-MM-DD}`이고, 날짜는 **서버가 Asia/Seoul 기준으로 계산**한다. 클라이언트가 보낸 `today`로 세면 날짜 조작으로 한도를 우회할 수 있기 때문이다. 값이 `DAILY_LIMIT` 이상이면 `429 DAILY_LIMIT`. TTL은 2일로 둬서 키가 쌓이지 않게 한다.
4. Anthropic 공식 SDK(`@anthropic-ai/sdk`)로 `AI_MODEL`을 호출한다. structured outputs(`output_config.format`, JSON 스키마)로 응답 형식을 강제한다. 타임아웃 30초, 재시도 1회.
5. 사후 검증(§3)을 통과해 **성공했을 때만** 카운트를 +1 하고 응답한다. 실패한 호출은 차감하지 않는다.

설정:

- `wrangler.toml` vars: `AI_MODEL = "claude-haiku-4-5"`, `DAILY_LIMIT = "20"`, `FIREBASE_PROJECT_ID`, 허용 origin(calendar-proxy와 같은 방식)
- KV 바인딩: `AI_USAGE`
- 시크릿: `ANTHROPIC_API_KEY`

## 3. 데이터 계약

**요청**

```json
{ "goal": "다음 달 이사 준비", "dueDate": "2026-10-31", "today": "2026-09-25" }
```

`today`는 사용자 기기의 로컬 날짜이며, AI가 날짜를 배치하는 기준으로만 쓴다.

**응답 200**

```json
{
  "plan": {
    "title": "이사 준비",
    "dueDate": "2026-10-31",
    "items": [
      { "title": "이사 업체 견적 3곳 받기", "dueDate": "2026-10-03", "priority": "high" }
    ]
  },
  "usage": { "used": 3, "limit": 20 }
}
```

- 상위 1, 하위 N의 **2단계 고정** 구조다. `parentId` 한 단계 모델과 맞고, structured outputs가 재귀 스키마를 지원하지 않는 것과도 맞다.
- `dueDate`는 `"YYYY-MM-DD"` 또는 `null`, `priority`는 `"low" | "medium" | "high"`.
- `usage.used`는 이번 호출이 반영된 값이다. 미리보기에 "오늘 3/20회"로 표시한다.

**사후 검증.** structured outputs는 JSON 형식만 보장하고 길이·개수 제약(`minLength`, `maxItems` 등)은 지원하지 않는다. 그래서 Worker가 다음을 확인한다.

- 하위 항목: 11번째부터 버린다. 0개면 `502 PLAN_INVALID`.
- 제목(상위·하위): 공백 제거 후 빈 문자열이면 해당 하위 항목을 버린다(상위가 비면 `502 PLAN_INVALID`). 100자 초과는 자른다.
- 날짜: 형식이 틀리거나 `today` 이전이거나 요청 `dueDate` 이후면 `null`로 바꾼다. 사용자가 미리보기에서 채우면 된다.
- `stop_reason`이 `refusal`이나 `max_tokens`면 `502 PLAN_INVALID`.

**에러 응답 형식**: `{ "error": "<CODE>" }`, calendar-proxy와 같다.

## 4. 프롬프트

- 시스템 프롬프트는 한국어이며 코드에 고정한다. 다음 규칙을 담는다.
  - 목표를 3~8개의 구체적이고 실행 가능한 단계로 나눈다.
  - 날짜는 오늘부터 마감일 사이에서 현실적인 순서로 배치한다.
  - 마감일이 없으면 날짜를 비워도 되고 억지로 채우지 않는다.
  - 상위 제목은 목표를 짧게 다듬은 것으로 한다.
- 사용자 입력(`goal`)은 user 메시지로만 전달한다.
- 입력은 본인 결과에만 영향을 주고 출력은 스키마로 제한된다. 따라서 프롬프트 인젝션 위험은 낮다고 판단한다.

## 5. 클라이언트

새 feature 폴더 `client/src/features/aiPlan/`:

- `api/aiProxyApi.ts`: `POST /plan` 호출, 에러 코드를 타입 있는 에러로 변환한다. `VITE_AI_PROXY_URL`을 사용한다.
- `hooks/useGeneratePlan.ts`: 호출 상태(로딩·에러) 관리.
- `hooks/usePlanDraft.ts`: 편집용 초안 상태. **순수 로직이라 UI와 분리해서 단위 테스트한다.**
- `components/`: 목표 입력 단계, 미리보기 겸 편집 단계, 항목 행, 진입 버튼.

**진입**

- 목록 화면의 "할 일 추가" 옆에 "AI로 계획" 버튼을 둔다.
- 무료 사용자에게도 보인다. 누르면 모달 안에 기존 `PremiumLockedNotice`("관심 있어요")를 보여준다. 통계·캘린더와 같은 패턴이다.

**1단계: 목표 입력** (기존 `Modal`)

- 목표(필수)와 마감일(선택)을 받는다. 버튼은 "계획 만들기".
- 입력칸 아래에 "입력한 목표는 계획 생성을 위해 AI(Anthropic)로 전송돼요"라는 안내 한 줄을 둔다.
- 요청 중에는 "계획을 짜는 중…"을 보여주고 버튼을 잠근다. 09-18 더블클릭 가드 패턴(Modal `disabled`)을 적용해서 중복 호출로 횟수가 두 번 차감되지 않게 한다.

**2단계: 미리보기 겸 편집**

```
┌ AI가 만든 계획 ─────────────── 오늘 3/20회 ┐
│ 상위  [이사 준비            ] [10/31] [보통▾] │
│ ☑ [이사 업체 견적 3곳 받기 ] [10/03] [높음▾] ✕ │
│ ☑ [전입신고 서류 확인      ] [10/10] [보통▾] ✕ │
│ ☐ [짐 정리(버릴 것 분류)   ] [    ] [낮음▾] ✕ │
│ + 항목 직접 추가                               │
├─────────────────────────────────────────────┤
│ [다시 만들기]            [취소] [2개 추가]     │
└─────────────────────────────────────────────┘
```

- **편집 가능**
  - 상위·하위의 제목, 날짜(날짜만), 우선순위를 고칠 수 있다.
  - 체크를 해제하면 추가에서 제외되고, ✕를 누르면 목록에서 지워진다.
  - "항목 직접 추가"로 빈 항목을 추가할 수 있다.
- **범위 밖**: 드래그 재정렬, 하위의 하위. 추가한 뒤 기존 목록에서 한다.
- **추가 버튼 비활성 조건**
  - 상위 제목이 비었거나 체크된 항목 중 제목이 빈 게 있을 때
  - 체크된 항목이 0개일 때
  - 날짜 검증은 기존 `assertValidTodoDates` 규칙을 따른다.
- **"다시 만들기"**: 같은 목표로 재호출하며 **횟수 1회 차감**된다. 초안을 수정했다면 "수정한 내용이 사라져요"라고 확인을 받는다.
- **닫기/취소**: 수정 내용이 있으면 확인을 받고, 없으면 바로 닫는다.
- 추가에 성공하면 모달을 닫고 토스트("N개 할 일을 추가했어요")를 띄운다.

**저장: `createPlanTodos(draft)`** (`features/todo/api/todoApi.ts`에 추가)

- 입력은 AI 원본 응답이 아니라 **사용자가 편집을 마친 초안**이다(체크된 항목만).
- 상위 1개와 하위 N개를 `writeBatch` 한 번으로 **원자적으로** 만든다. `createTodo` 후 `createChildTodo`를 N번 부르면 중간 실패 시 반쯤 만들어진 플랜이 남기 때문이다. 상위 문서 id는 `doc(todosRef)`로 미리 만들어 하위의 `parentId`에 넣는다.
- 필드 값
  - 상위: order는 다음 루트 order(기존 `getNextRootOrder`), `parentId: null`
  - 하위: order는 0부터 N-1
  - 공통: `status: "todo"`, `recurrence: null`, `recurrenceId: null`, `archived: false`, `startAt: null`, `description` 없음
  - 전부 `todo`로 시작하므로 상위 상태 재계산이 필요 없다.
- **날짜 변환**: 기존 관례(`todayPage`·`calendar`의 `initialDueAt={`${date}T00:00`}` → TodoForm의 `new Date(...).toISOString()`)와 똑같이 **로컬 자정을 UTC로** 변환한다. 날짜 문자열을 직접 자르거나 이어 붙여 UTC로 저장하지 않는다(KST에서 하루 밀리는 과거 버그 재발 방지).
- 저장 후 할 일 쿼리를 무효화한다. 캘린더를 연동한 사용자의 동기화는 App 전역 `useSyncTodosToCalendar`가 캐시 변화로 처리하므로 별도 호출이 없다.

## 6. 에러 처리

모든 실패에서 **횟수는 차감되지 않는다**(카운트는 성공 시에만 증가).

| 상황 | 사용자 표시 | Sentry |
|---|---|---|
| `403 PREMIUM_REQUIRED` | 잠금 안내(`PremiumLockedNotice`) | 보고 안 함 |
| `429 DAILY_LIMIT` | "오늘 사용 횟수를 다 썼어요. 내일 다시 시도해 주세요" | 보고 안 함 |
| `502 PLAN_INVALID` | "계획을 만들지 못했어요. 목표를 조금 더 구체적으로 적어주세요" | 보고 안 함 |
| `400 INVALID_INPUT` | 입력 검증 메시지(클라이언트가 먼저 막으므로 정상 경로에선 안 나옴) | 보고 |
| Anthropic 과부하·타임아웃(Worker `503 AI_UNAVAILABLE`), 네트워크 오류, 그 밖의 5xx | "잠시 후 다시 시도해 주세요" | 보고 |
| `createPlanTodos` 실패 | "추가하지 못했어요" + 초안 유지(다시 누를 수 있게) | 보고 |

Worker는 Anthropic SDK의 타입 있는 에러 클래스로 분기한다. 문자열 매칭은 하지 않는다.

## 7. 테스트

CI는 실제 Anthropic API를 호출하지 않는다.

- **worker-auth**: calendar-proxy에서 옮긴 테스트. 이동 후 **calendar-proxy 기존 테스트가 전부 통과**해야 한다.
- **ai-proxy**(Anthropic 클라이언트 mock)
  - 토큰 없음·무효 → 401, 무료 → 403
  - 한도 도달 → 429, 이때 Anthropic 미호출
  - 성공 → 카운트 +1, `usage` 반영 / 실패(거절, max_tokens, 예외) → 카운트 불변
  - 사후 검증: 11개 이상 자르기, 빈 제목 제거, 범위 밖 날짜 null, 0개 → 502
  - 서울 기준 날짜 키: 시스템 시간 mock으로 UTC 15:00 전후 경계 확인
  - CORS 허용·차단
- **client**
  - `usePlanDraft`: 수정, 체크 토글, 삭제, 직접 추가, 추가 버튼 조건, "수정됨" 여부
  - `createPlanTodos`: 한 batch로 상위 1 + 체크된 하위만 생성, parentId·order·status 값, 날짜 로컬 자정 → UTC 변환(시스템 시간 mock, UTC 리터럴 픽스처로 버그 구현을 통과시키지 않게)
  - 모달: 무료 사용자 잠금 표시, 로딩 중 버튼 잠금, 에러 코드별 문구, 다시 만들기·닫기 확인
- **E2E**(Playwright): ai-proxy 응답을 route로 가로채 happy path 하나(입력 → 항목 수정·해제 → 추가 → 목록에 상위·하위 반영).

## 8. 배포

- **CI**
  - `ai-proxy` job(테스트·typecheck, main push 시 `wrangler deploy`)을 추가한다.
  - paths-filter의 `aiProxy`는 `ai-proxy/**`와 `packages/worker-auth/**`에 반응한다. 기존 `calendarProxy` 필터에도 `packages/worker-auth/**`를 추가한다. worker-auth가 바뀌면 두 Worker 모두 테스트·배포해야 한다.
- **사용자가 직접 할 일**
  - KV namespace 생성(`wrangler kv namespace create AI_USAGE`) → id를 `wrangler.toml`에 반영
  - `wrangler secret put ANTHROPIC_API_KEY`: harness 셸이 비대화형이라 본인 터미널에서 실행
  - Anthropic Console에서 API 키 발급, 월 사용 한도(spend limit) 설정 권장
- **클라이언트 환경변수** `VITE_AI_PROXY_URL`
  - `client/.env`와 GitHub Secret에 둔다.
  - CI의 **build job과 deploy job env 양쪽**에 넣는다. Sentry DSN이 deploy job에만 빠졌던 함정을 반복하지 않기 위해서다.

## 9. 알고 감수한 한계

1. **KV 카운터는 원자적이지 않다.** 동시 요청 시 하루 한도를 1~2회 넘길 수 있다. 목적은 남용 방지이지 정확한 과금이 아니므로 감수한다. **결제(조각 3) 설계 때 Durable Object 전환을 다시 검토한다.**
2. **`premium` 클레임 전파가 최대 1시간 지연된다**(ID 토큰 갱신 전까지). 부여 직후 사용자는 잠시 403을 볼 수 있다. 기존 캘린더 연동과 같다.
3. 기존 할 일·구글 캘린더 일정을 보지 않으므로 이미 바쁜 날을 피하지 못한다(의도한 범위 결정).
