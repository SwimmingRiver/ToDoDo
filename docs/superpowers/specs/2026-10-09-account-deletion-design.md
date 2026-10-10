# 회원 탈퇴(계정 삭제) 설계

- 날짜: 2026-10-09
- 브랜치: `feat/account-deletion` (develop 기반)
- 선행: 프리미엄 결제(`2026-10-04-premium-billing-paddle-design.md`), 법적 페이지(`2026-10-08-landing-legal-pages-design.md`), 모바일 로그아웃(PR #144)

## 목적

- 스토어 심사 필수 요건: Apple 심사 지침 5.1.1(v) — 계정을 만들 수 있는 앱은 앱 안에서 계정 삭제를 시작할 수 있어야 한다.
- 개인정보처리방침의 "이메일로 요청 시 계정·데이터 삭제"를 실제 기능으로 바꾼다.

**성공 기준**

- 웹(프로필 메뉴)과 앱(계정 화면)에서 사용자가 직접 탈퇴할 수 있다.
- 탈퇴 후 아래 "삭제 범위"의 데이터가 남지 않는다(피드백은 익명화).
- 구독 중이었다면 Paddle 구독이 즉시 해지되어 더 이상 청구되지 않는다.
- 중간에 실패해도 같은 버튼을 다시 눌러 끝까지 완료할 수 있다.

## 결정 사항

| 항목 | 결정 |
| --- | --- |
| 범위 | 서버 + 웹 + 앱을 이 브랜치에서 모두 |
| 구독 처리 | 탈퇴 시 Paddle 구독 **즉시 해지**, 환불은 기존 정책(결제 14일 이내 요청 시 전액)대로 수동 처리. 자동 환불 안 함 |
| 오케스트레이션 | 방식 A — 클라이언트가 Worker를 순서대로 호출, 최종 삭제는 billing-proxy가 담당. 새 Worker 만들지 않음 |
| 피드백 | 삭제하지 않고 `userId`·`email`만 제거해 익명화. 개인정보처리방침 문구는 그대로 |
| 재인증 | 하지 않음 — Auth 계정 삭제를 서버(Admin 권한)가 하므로 Firebase의 "최근 로그인" 요구가 없다 |
| AI 사용량 KV | 손대지 않음 — TTL로 자동 만료 |

## 삭제 범위

| 데이터 | 위치 | 처리 주체 |
| --- | --- | --- |
| 구글 캘린더 이벤트 + OAuth 토큰 | 구글 / calendar-proxy KV `CALENDAR_TOKENS` | calendar-proxy `/disconnect`(기존) |
| 푸시 토큰·알림 기록·예약 알람 | reminder-proxy Durable Object(uid별) | reminder-proxy `DELETE /account`(신규) |
| Paddle 구독 | Paddle | billing-proxy `POST /account/delete`(신규) |
| `todos`(userId == uid) | Firestore | 〃 |
| `feedback`(userId == uid) | Firestore | 〃 — 익명화 |
| `userSettings/{uid}`, `calendarIntegrations/{uid}`, `entitlements/{uid}` | Firestore | 〃 |
| Firebase Auth 계정 | Firebase Auth | 〃 (마지막) |
| AI 일일 사용량 | ai-proxy KV | 처리 안 함(TTL) |

## 전체 흐름

클라이언트(웹·앱 공통 순서):

1. calendar-proxy `POST /disconnect` — 연동 여부와 무관하게 항상 호출한다. 토큰이 없으면 서버가 `{ ok: true }`로 끝낸다.
   연동 여부를 미리 묻지 않는 이유: `calendarIntegrations`는 프리미엄 클레임이 있어야 읽히므로 구독 만료 사용자는 알 수 없다.
   바디의 `googleEventIds`는 할 일들의 `googleEventId`(웹은 연동 해제와 같이 스냅샷의 고아 이벤트 id도 포함).
   구글 이벤트 삭제 실패는 서버가 삼키므로(기존 불변식) 진행을 막지 않는다. HTTP 자체가 실패하면 중단.
2. reminder-proxy `DELETE /account`.
3. billing-proxy `POST /account/delete`.
4. 이 기기 로컬 정리 + 로그아웃.

1~3 중 하나라도 실패하면 거기서 멈추고 "일부만 처리되었습니다. 다시 시도해 주세요"를 보여 준다.
모든 단계가 멱등이라 재시도는 처음부터 다시 돈다. Auth 계정 삭제가 맨 마지막이라, 실패한 시점에는 항상 ID 토큰이 살아 있다.

## 서버

### billing-proxy `POST /account/delete`

- ID 토큰 검증만 하고 **`BILLING_ALLOWED_UIDS` 허용 목록은 검사하지 않는다** — 탈퇴는 누구나 가능해야 한다.
  라우터에서 기존 `ACCOUNT_ROUTES`(허용 목록 적용)와 별도 분기로 둔다.
- 순서:
  1. `entitlements/{uid}`를 읽어 `source === "paddle"`이고 `subscriptionId`가 있고 `status !== "canceled"`이면
     Paddle `POST /subscriptions/{id}/cancel` `{ effective_from: "immediately" }`.
     - 오류 응답이면 `GET /subscriptions/{id}`로 상태를 조회해 `canceled`일 때만 성공으로 본다(재시도 시 이미 해지된 경우).
     - 그 밖의 실패 → **아무것도 지우지 않고** `502 { error: "PADDLE_CANCEL_FAILED" }`.
  2. `todos` 중 `userId == uid`를 runQuery로 조회해 `:commit`으로 최대 500건씩 삭제(커밋 상한), 결과가 빌 때까지 반복.
  3. `feedback` 중 `userId == uid`를 조회해 `userId`·`email` 필드만 제거(updateMask로 필드 삭제). `content`·`createdAt`은 남긴다.
  4. `userSettings/{uid}`, `calendarIntegrations/{uid}`, `entitlements/{uid}` 삭제. 문서가 없어도 성공.
  5. Identity Toolkit `accounts:delete`로 Auth 계정 삭제. 이미 없으면(`USER_NOT_FOUND`) 성공.
  6. `204`.
- Firestore 계정 데이터 삭제와 Auth 계정 삭제는 기존 `EntitlementStore`·`ClaimsClient`처럼 클래스로 분리하고
  `fetchFn`을 주입받아 가짜 fetch로 테스트한다. `fetchFn` 기본값은 화살표 함수로 감싼다(Worker `this` 바인딩 함정).
- Paddle 클라이언트에 `cancelSubscription(id)`·`getSubscriptionStatus(id)` 추가.
- 서비스 계정 스코프는 기존 `cloud-platform`으로 충분.

### Paddle 해지 웹훅과의 관계 (변경 없음, 테스트로 고정)

즉시 해지하면 Paddle이 `subscription.canceled` 웹훅을 나중에 보낸다. 기존 `commitEntitlement`는 클레임을 문서보다 **먼저** 쓰고,
`ClaimsClient.setPremiumUntil`은 사용자가 없으면 `UserNotFoundError`를 던지며, 웹훅 핸들러는 이를 200으로 처리한다.
따라서 Auth 삭제 후 도착한 웹훅은 `entitlements` 문서를 되살리지 않고 재전송 루프도 없다. 이 동작을 테스트로 고정한다.

**알고 감수한 한계**: 4단계(entitlements 삭제)와 5단계(Auth 삭제) 사이 수 초 안에 웹훅이 도착하면 `entitlements/{uid}`가
다시 생길 수 있다. Auth를 먼저 지우면 이 틈은 없지만, 이후 단계가 실패했을 때 재시도할 토큰이 없어져 삭제를 끝낼 수 없다.
남는 것이 개인정보가 거의 없는 고아 문서 하나라 지금 순서를 유지한다.

### reminder-proxy `DELETE /account`

- ID 토큰 검증 → uid의 Durable Object에서 `deleteAlarm()` 후 저장소의 모든 테이블 행을 비운다(`ReminderStore.clearAll()`). `204`.
  `storage.deleteAll()`을 쓰지 않는 이유: 테이블까지 사라져, 같은 DO 인스턴스가 이후 요청을 받으면 생성자에서 만든 테이블이 없어 SQL 오류가 난다.
- DO에 `deleteAccount()` RPC 메서드 추가.

### 배포 전 확인

- billing-proxy 서비스 계정에 Firestore 쓰기(삭제 포함)·Firebase Auth 사용자 삭제 권한이 있는지 IAM에서 확인.
  (클레임 설정에 이미 Auth 관리 권한을 쓰므로 있을 가능성이 높다.)
- 배포 순서: Worker(billing·reminder) 먼저 → 웹/앱. 클라이언트가 먼저 나가면 새 엔드포인트가 404.

## 웹 (client)

- `features/account`(신규)에 `deleteAccount()` 오케스트레이션 함수와 `useDeleteAccount` 훅.
  각 Worker 호출은 해당 feature의 api 모듈(`calendarProxyApi`, reminders push api, `billingApi`)에 함수를 추가해 재사용한다.
- 프로필 메뉴(`layouts/profileMenu`)의 "로그아웃" 아래에 "회원 탈퇴" 항목 → 확인 모달.
  - 본문: "할 일·설정·구글 캘린더 연동이 모두 삭제되며 복구할 수 없습니다."
  - 프리미엄 구독 중이면(기존 entitlement 훅) 추가 문구:
    "구독이 즉시 해지되고 남은 기간은 사라집니다. 결제 14일 이내라면 환불을 요청할 수 있습니다."
  - "탈퇴하기"(destructive) 버튼. 진행 중엔 비활성 + 진행 표시, 모달 닫기 막음.
  - 실패 시 모달 안에 오류 문구, 재시도 가능.
  - 모달은 프로필 메뉴 드롭다운의 자식이 아닌 형제로 둔다(닫히며 같이 unmount되는 함정).
- 성공 시: 기존 `logout()`(푸시 토큰 해제 포함) → 캘린더 동기화 스냅샷 키 삭제, React Query 캐시 clear → `/`로 이동 후 "탈퇴가 완료되었습니다" 토스트.

## 앱 (mobile)

- 환경변수 `EXPO_PUBLIC_CALENDAR_PROXY_URL`, `EXPO_PUBLIC_REMINDER_PROXY_URL`, `EXPO_PUBLIC_BILLING_PROXY_URL` 추가.
- `src/account/deleteAccount.ts`: ID 토큰을 붙여 세 Worker를 순서대로 호출. 캘린더 이벤트 id는 `@tododo/core`의 `getTodos` 결과의 `googleEventId`.
- `AccountScreen`의 로그아웃 버튼 아래에 "회원 탈퇴"(텍스트형, 빨간색) 버튼 → `Alert.alert` 확인.
  앱은 아직 구독 상태를 표시하지 않으므로 구독 해지 안내 문구를 항상 포함한다.
- 성공 시 기존 `signOut(queryClient)`(예약 알림 취소·구글 로그아웃·캐시 clear) → RootNavigator가 로그인 화면으로 전환.
- 실패 시 `Alert`로 "일부만 처리되었습니다. 다시 시도해 주세요."

## 테스트

- billing-proxy: 정상 흐름(호출 순서 포함), Paddle 해지 실패 시 아무것도 안 지움, 이미 해지된 구독, 이미 없는 Auth 사용자,
  todos 500건 초과 분할, 피드백 익명화, 허용 목록 밖 사용자 허용, 삭제된 사용자에 대한 해지 웹훅이 문서를 되살리지 않음.
- reminder-proxy: `DELETE /account` 인증·저장소 비움·알람 취소.
- client: `deleteAccount` 호출 순서·중간 실패 중단, 모달 상태(진행/실패/재시도), 성공 시 정리·이동.
  `VITE_FIREBASE_API_KEY= npx vitest run`으로 CI 등가 확인.
- mobile: `deleteAccount` 호출 순서·실패, AccountScreen 버튼·확인 흐름.
- 수동: billing-proxy 로컬 실검증 절차(Paddle 샌드박스)로 구독 해지 → 삭제 → 웹훅 확인.

## 범위 밖

- 자동 환불, 앱 내 구독 상태 표시, 인앱결제(IAP) 구독 안내(IAP 도입 시 별도).
- 탈퇴 사유 수집, 유예 기간(삭제 대기) 기능.
