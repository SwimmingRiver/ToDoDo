# 프리미엄 엔타이틀먼트 서버 사이드 강제 — 설계

## Context

2026-09-14에 구글 캘린더 연동/완료 통계(`/insights`)를 프리미엄 기능으로 전환하면서(PR #109) `entitlements/{uid}` Firestore 문서와 `useIsPremium` 훅으로 게이팅 뼈대를 만들었다. 이 잠금은 당시 **클라이언트 UI에서만 강제**되고, `firestore.rules`의 `calendarIntegrations` 규칙과 `calendar-proxy`(Cloudflare Worker) 어디에도 엔타이틀먼트 검사가 없었다. devtools로 Firestore SDK를 직접 호출하거나 calendar-proxy 엔드포인트를 직접 두드리면 무료 사용자도 캘린더 연동 기능을 그대로 쓸 수 있는 상태였다.

당시엔 실제 결제가 없어 우회의 실익이 없다는 이유로 의도적으로 보류했으나, 이번에 서버 사이드 강제를 실제로 넣기로 함. 목표는 "본인 인증"이 아니라 "이 인증된 사용자가 프리미엄인가"를 `firestore.rules`와 `calendar-proxy` 양쪽에서 확인하는 것.

## 전체 구조

`entitlements/{uid}` Firestore 문서는 지금처럼 클라이언트 UI(`useIsPremium`)가 읽는 유일한 소스로 유지한다. 여기에 더해, PM이 프리미엄을 부여/회수할 때 **같은 작업이 Firebase Auth 커스텀 클레임(`premium: true/false`)도 함께 설정**한다.

`firestore.rules`와 `calendar-proxy`는 Firestore를 직접 조회하지 않고, 이미 검증되는 ID 토큰에 실려 오는 이 커스텀 클레임만 읽어서 판단한다. 새 시크릿이나 서비스 계정, 추가 네트워크 호출이 필요 없다.

**알려진 한계**: 클라이언트가 들고 있는 ID 토큰이 자동 갱신될 때까지(최대 1시간) 클레임 변경이 반영되지 않을 수 있다. PM이 수동으로 부여하는 지금 워크플로우에서는 즉시성이 중요하지 않으므로 감수한다. 또한 Firestore 문서(entitlements)와 Auth 커스텀 클레임 두 곳에 같은 상태가 존재하게 되므로, 반드시 `grantEntitlement` 스크립트를 통해서만 두 곳을 동시에 바꿔야 한다 — 한쪽만 수동으로 고치면 드리프트가 생긴다.

## firestore.rules 변경

```
match /calendarIntegrations/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId
                      && request.auth.token.premium == true;
}
```

`request.auth.token.premium`은 커스텀 클레임을 그대로 읽는 것이라 `get()`/`exists()` 같은 추가 문서 조회가 필요 없다.

**트레이드오프**: 이 조건은 read/write 모두에 걸리므로, 연동 중이던 사용자의 엔타이틀먼트가 나중에 회수되면 그 사용자는 "연동 해제" 시의 Firestore 쓰기(`connected: false` 기록)도 거부당한다. 클라이언트 쿼리가 `enabled: isPremium`이라 평소 UI 흐름에서는 발생하지 않고(다운그레이드된 사용자는 애초에 이 문서를 읽지도, 해제 버튼을 보지도 않음), 아직 실사용자가 없어 지금은 범위 밖으로 둔다. 필요해지면 "연동 해제 쓰기는 프리미엄 무관 허용"으로 좁히는 후속 작업을 별도로 진행한다.

## calendar-proxy 변경

- `calendar-proxy/src/auth.ts`의 `verifyFirebaseIdToken`이 `{ uid }` 대신 `{ uid, premium }`을 반환하도록 확장한다. `premium`은 이미 파싱하는 JWT payload에서 `premium` 커스텀 클레임을 읽고, 없으면 `false`로 취급한다.
- 게이트 대상 핸들러: `oauthStart`, `events`(조회), `syncTodos`. `verifyFirebaseIdToken` 성공 후 `premium`이 `false`면 `403 { error: "PREMIUM_REQUIRED" }`를 반환한다.
- **`oauthCallback`은 게이트하지 않는다 (계획 단계에서 발견한 기술적 제약)**: 이 핸들러는 구글이 브라우저를 리다이렉트시켜 호출하는 엔드포인트라 `Authorization` 헤더 자체가 없다 — ID 토큰을 검증할 방법이 없다. 대신 `/oauth/start`가 발급한 1회용 `state` 토큰(이미 검증된 uid에 묶여 있음)만으로 uid를 식별한다. `oauthStart`에서 이미 프리미엄이 아니면 state 자체를 발급하지 않으므로, 정상 흐름에서 비프리미엄 사용자는 `oauthCallback`에 도달할 유효한 state를 가질 수 없다.
- `disconnect` 핸들러는 게이트하지 않는다 — 프리미엄이 아니어도 언제든 연동을 끊을 수 있어야 한다. firestore.rules 쪽에서 감수하기로 한 트레이드오프와 반대 방향 결정이며, 여기서는 비용이 적으니 명확히 열어둔다.

## 부여/회수 스크립트

`scripts/grantEntitlement.ts` 신설. 기존 `scripts/backfillArchivedField.ts`와 동일하게 `GOOGLE_APPLICATION_CREDENTIALS` 환경변수 + `applicationDefault()` 패턴을 따른다.

사용법:
```
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run grant-entitlement -- --uid <uid> --plan premium
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run grant-entitlement -- --uid <uid> --plan free
```

동작 (admin SDK, 한 프로세스 안에서 순서대로):
1. `entitlements/{uid}` 문서를 upsert — `plan`, `status`(`premium` 부여 시 `"active"`, 회수 시 `"none"`), `source: "manual"`, `updatedAt`(ISO 문자열).
2. `admin.auth().setCustomUserClaims(uid, { premium: plan === "premium" })`.

두 단계 중 하나만 실패해도 콘솔에 명확히 에러를 남기고 비정상 종료해서, 문서와 클레임이 불일치한 채로 조용히 끝나지 않게 한다.

## 테스트/검증

- **calendar-proxy**: 게이트된 4개 핸들러(`oauthStart`, `oauthCallback`, `events`, `syncTodos`)의 기존 테스트에 "premium claim 없는 토큰 → 403 PREMIUM_REQUIRED" 케이스를 추가한다. `auth.test.ts`에는 클레임 파싱(있음/없음/false) 테스트를 추가한다. `disconnect.test.ts`는 게이트가 없다는 걸 확인하는 회귀 테스트를 추가한다(실수로 나중에 게이트가 붙는 걸 방지).
- **firestore.rules**: 프로젝트에 rules 전용 자동 테스트 인프라가 없다(기존 `calendarIntegrations`/`entitlements` 규칙도 테스트 없음). 이번에도 새 테스트 프레임워크(`@firebase/rules-unit-testing` + 에뮬레이터)는 도입하지 않고, Firebase 콘솔 Rules Playground로 수동 검증한다. 자동화가 필요해지면 별도 작업으로 제안한다.
- **grantEntitlement 스크립트**: 로컬에서 테스트 프로젝트(또는 에뮬레이터)로 1회 수동 실행해 문서와 클레임이 둘 다 기대대로 바뀌는지 확인한다.

## 문서 업데이트

`client/CLAUDE.md`의 entitlement 설명 — "지금은 운영자가 Firestore 콘솔에서 직접 값을 넣고" 부분을 "지금은 운영자가 `scripts/grantEntitlement.ts`로 문서와 커스텀 클레임을 함께 설정하고"로 갱신한다.

## 범위 밖

- calendar-proxy가 Firestore를 직접 조회하는 방식(서비스 계정 인증)이나 KV 미러링 방식은 채택하지 않음(커스텀 클레임으로 결정).
- firestore.rules 자동 테스트 인프라 신설.
- 결제 웹훅 연동 자체(이 설계는 여전히 수동 부여 전제 — 웹훅이 붙을 때 `grantEntitlement`의 로직을 Admin SDK 호출로 재사용할 수 있게 구조화하는 정도만 고려).
