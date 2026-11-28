# Firestore rules 테스트 스위트 설계

- 날짜: 2026-11-28
- 크기: 작은 변경(짧은 설계)

## 왜

`firestore.rules`(90줄, 컬렉션 7개)에는 자동 테스트가 없다. 지금까지 권한 문제는 사람이 에뮬레이터로
손수 찾았다. 대표 사례가 11-22의 G1이다. core `deleteTodo`의 하위 조회에 `userId` 조건이 빠져서
rules가 **쿼리 자체를 거부**했고, 그 결과 앱의 일반 삭제가 전부 실패했다. rules는 맞았고 앱 코드의
조회 모양이 틀렸던 것이다. core의 기존 단위 테스트는 Firestore를 mock해서 rules를 거치지 않으므로
이 버그를 통과시켰다.

12-28 실사용자 공개 전에, rules나 core 조회 코드가 바뀌면 CI가 병합 전에 다음 두 가지를 잡게 한다.

- 막아야 할 접근이 열리는 퇴행(남의 할 일, userId 바꿔치기, entitlements 직접 쓰기 등)
- 정상 사용이 거부되는 퇴행(G1 유형)

## 목표

1. **rules 표 테스트**: 7개 컬렉션 × 동작(read/create/update/delete, 해당하는 것만) × 사용자 종류
   (본인, 다른 사람, 비로그인, 운영자 클레임, 프리미엄 클레임 유효·만료)별로 허용·거부를 확인한다.
   rules 파일에 있는 조건마다 최소 하나의 허용 사례와 하나의 거부 사례를 둔다. 예를 들면
   description 2000자 경계, 상한 도입 전에 저장된 긴 description을 바꾸지 않는 update,
   feedback의 status 외 필드 수정, userSettings의 허용 키·값.
2. **core 계약 테스트**: core에서 Firestore를 실제로 쓰는 함수를 mock 없이 에뮬레이터와 실제 rules
   위에서 **본인 계정으로** 돌려 성공하는지 확인한다. 이렇게 하면 쿼리 모양 때문에 생기는 거부가 잡힌다.
   - `api/todoApi`: getTodos, fetchAllUserTodos, createTodo, updateTodo(상위 재계산 batch 포함),
     deleteTodo(하위 있음·없음 둘 다)
   - `api/todoDocs`: getNextRootOrder
   - `api/planTodoApi`: createPlanTodos
   - `recurring/seriesApi`: createRecurringTodo, editRecurringSeries, deleteRecurringSeries(회차 하위 포함)
   - `recurring/startupMaintenanceApi`: runStartupMaintenance
   - 다른 사람 데이터가 섞여 있을 때도 본인 함수가 성공하고 남의 문서는 건드리지 않는지 확인한다.
3. **G1 회귀 실증**: 구현 중 한 번, deleteTodo 하위 조회에서 `userId` 조건을 임시로 빼서 계약 테스트가
   실패하는지 확인한다(커밋하지 않음). 테스트가 실제로 이 유형의 버그를 잡는다는 증거로 PR에 적는다.
4. **CI**: "Firestore Rules" job을 추가하고, 배포 job이 이 job의 통과를 기다리게 한다.

## 하지 않는 것

- 웹 `client/`의 자체 Firestore api. core와 따로 있으며 후속 과제로 남긴다.
- 앱이 core 없이 직접 쓰는 코드(entitlementApi, reminderSettingsApi, calendarIntegration, deleteAccount)의
  계약 테스트. 이 코드가 쓰는 컬렉션은 목표 1의 표 테스트로 다룬다.
- Worker·스크립트(Admin SDK)의 경로. 이 경로는 rules를 우회한다.
- `firestore.indexes.json` 검증. rules 자체의 동작 변경도 하지 않는다. 테스트하다 rules 버그를 찾으면
  별도로 보고한다.

## 실패로 보는 것

- 테스트가 운영 Firebase 프로젝트에 닿는 것. 반드시 `demo-` 프로젝트 ID와 에뮬레이터만 쓴다.
- 기존 `npm test`(core 단위 테스트)가 느려지거나 에뮬레이터를 요구하게 되는 것
- 간헐 실패. 테스트마다 데이터를 비우고, 시간에 의존하는 값은 고정한다.
- main push에서 이 job이 skip돼 배포까지 skip되는 것(paths-filter와 needs 함정)

## 방법 (사용자 선택: 방법 1)

| 방법 | 내용 | 트레이드오프 |
|---|---|---|
| **1. core 안 별도 묶음 (선택)** | `packages/core`에 rules 전용 vitest 설정을 두고 `npm run test:rules`로 실행한다. 이 명령이 `firebase emulators:exec`로 에뮬레이터를 띄우고 내린다 | core 함수를 소스에서 바로 쓸 수 있고 vitest도 있다. 대신 core에 rules 표 테스트가 함께 들어간다 |
| 2. 루트 새 패키지 `rules-tests/` | core를 dist로 가져다 쓴다 | 분리는 깔끔하지만 core 빌드가 먼저 필요하고 의존성을 하나 더 관리해야 한다 |
| 3. rules 표만 검사 (범위 A) | — | 작지만 G1 유형을 못 잡는다. 사용자가 범위 B를 선택해 제외됐다 |

## 정해진 것

- 범위: rules 표 + core 계약(B), 위치: `packages/core`(방법 1) — 사용자 결정
- 기존 단위 테스트와 분리한다. 기본 `vitest run`은 rules 테스트 파일을 제외하고, 별도 설정 파일이 그
  파일만 포함한다 — 설계자 결정
- 의존성: `@firebase/rules-unit-testing`(firebase 12와 맞는 버전인지 peer 확인), `firebase-tools`는 core
  devDependency로 추가한다(client와 같은 메이저) — 설계자 결정
- 인증 흉내: 표 테스트는 rules-unit-testing의 authenticated/unauthenticated 컨텍스트를 쓰고, 운영자·
  프리미엄은 토큰 클레임(`operator`, `premiumUntil` epoch 초)으로 표현한다. 계약 테스트는 core가 받는
  모듈러 `Firestore`가 필요하므로 `connectFirestoreEmulator(..., { mockUserToken })`로 사용자별 인스턴스를
  만든다. 사전 데이터는 rules를 끈 컨텍스트로 넣는다 — 설계자 결정
- 에뮬레이터 설정은 루트 `firebase.json`(firestore 8080)과 `firestore.rules`를 그대로 쓴다 — 설계자 결정
- CI job
  - 이름 "Firestore Rules", Java 21, 에뮬레이터 캐시
  - changes 필터 `rules`: `firestore.rules`, `firebase.json`, `packages/core/**`, `.github/workflows/ci.yml`
  - 조건은 Client job과 같은 패턴이다. 필터가 true일 때, changes job이 실패했을 때, main push일 때는 항상 돈다
  - `deploy.needs`에 추가한다 — 설계자 결정

## 빌더에게 맡기는 것

- 테스트 파일 구성과 이름(예: `src/__rules__/*.rules.test.ts`), 사례별 세부 목록
- 계약 테스트의 시간 고정 방식. 반복·정리 작업은 날짜에 의존하므로 시스템 시간 mock을 쓴다. 절대 날짜
  하드코딩은 금지(07-21 CI 실패 교훈)
- 로컬 함정 안내를 core README나 스크립트 주석에 남긴다. JAVA_HOME은 JDK 21이어야 하고, 8080에 고아
  에뮬레이터가 있으면 E2E와 같은 오류가 난다
