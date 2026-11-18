# 모바일 인앱결제(IAP)와 구독 출처 통합 설계

작성일: 2026-11-18 · 관련: `2026-10-04-premium-billing-paddle-design.md`(웹 Paddle), `2026-10-09-account-deletion-design.md`(탈퇴)

## 왜 하는가

웹 Paddle 실결제가 열렸다(11-17, 릴리스 #184). 로드맵상 다음은 모바일 앱의 프리미엄과 스토어 출시다.

Apple 가이드라인 3.1.1/3.1.3(b)에 따라, 웹에서 산 구독을 앱에서도 쓰게 하려면 같은 구독을 앱 안에서 인앱결제로도 팔아야 한다. 앱에서 웹 결제로 유도하는 링크나 문구도 넣을 수 없다. 그래서 스토어 제출 전에 IAP가 반드시 있어야 한다.

사용자의 원칙(11-18): **프리미엄은 계정 하나에 하나다. 웹에서 샀든 앱에서 샀든 같은 계정이면 웹과 앱 어디서나 똑같이 프리미엄이고, 아니면 일반 화면이다. 웹과 앱의 간극을 최대한 없앤다.**

## 이 문서의 범위

모바일 프리미엄 작업은 네 개의 프로젝트로 나눈다. 이 문서는 ①만 다룬다.

1. **결제와 구독 출처 통합 (이 문서)**: 앱 구독 구매·복원, 스토어 서버 알림 처리, 출처 여러 개를 하나의 `premiumUntil`로 합치기, 체험·이중 구독·환불·탈퇴 처리
2. AI 플랜 앱 이식 (별도 설계)
3. 구글 캘린더 연동 앱 이식 (별도 설계)
4. 인사이트(통계) 앱 이식 (별도 설계)

**출시 조건(사용자 결정)**: 스토어 첫 출시에 2~4가 모두 들어가야 한다. ①은 2~4가 기대는 "앱에서 프리미엄인지"를 제공한다.

## 목표

1. 앱(iOS·Android)에서 월 구독을 사고, 복원하고, 상태를 볼 수 있다.
2. Apple App Store Server Notifications v2와 Google Play RTDN을 **billing-proxy가 직접** 받아 검증하고 반영한다. RevenueCat 같은 중개 서비스는 쓰지 않는다(사용자 결정).
3. `entitlements/{uid}`가 출처별(Paddle·Apple·Google·체험·운영자) 기록을 함께 갖고, 최종 `premiumUntil`은 **유효한 출처 중 가장 늦은 시각**이다. 커스텀 클레임도 그 값이다.
4. 서버(firestore.rules·calendar-proxy·ai-proxy)는 고치지 않는다. 계속 `premiumUntil` 클레임만 읽는다.
5. 기존 Paddle 웹훅 동작과 "클레임 먼저 → 문서 나중" 커밋 순서를 깨지 않는다.

## 하지 않는 것 (non-goals)

- AI 플랜·캘린더 연동·통계의 앱 이식 (2~4 별도 설계)
- 연간 요금제 (운영 후 재논의, 먼저 제안 금지)
- 탈퇴 후 재가입 시 체험 재지급 구멍 (별도 할 일: `trial-reuse-after-deletion`)
- 웹 Paddle 환불 ↔ 구독 해지 자동 연동 (별도 후속)
- 미국 외부 결제 링크 허용(앱에서 웹 결제 안내) 활용
- 가족 공유(Family Sharing): 상품에서 끈다
- 이메일 발송: 안내는 앱·웹 화면 배너로만 한다
- **약관·환불 정책 개정 (보류, 사용자 검토 중 11-18)**: 지금 문구는 앱 구독과 맞지 않는다(`refund.ts` "14일 전액 환불, Paddle로 처리", `terms.ts` 21행 "탈퇴하면 구독 즉시 해지"). 앱 결제 환불은 스토어가 하고, 스토어 구독은 탈퇴로 해지되지 않는다. 개정 여부·범위·시점은 사용자가 따로 정한다. **스토어 제출 전에는 다시 확인해야 하는 항목**이다. 이 프로젝트는 개정을 전제로 하지 않는다.

## 실패로 보는 것 (anti-goals)

- 웹 구독자가 앱에서 일반 화면을 보거나, 앱 구독자가 웹에서 일반 화면을 본다
- 한 출처의 해지·환불이 다른 출처로 살아 있는 구독의 권한을 지운다
- 결제한 사람이 알림 누락·지연으로 프리미엄을 못 쓴다 (앱 구매 직후에도 바로 켜져야 한다)
- 남의 영수증이나 위조 알림으로 프리미엄을 얻는다
- 앱 안에서 웹 결제를 안내하거나 링크해서 심사에서 거절된다

## 사용자 결정 사항 (11-18)

| 주제 | 결정 |
|---|---|
| 검증 위치 | 우리 서버(billing-proxy)에서 직접. 중개 서비스 안 씀 |
| 가격 | 앱도 월 4,900원(웹과 동일). Apple 소규모 사업자 프로그램(15%) 가입 전제. 4,900원 가격 단계가 없으면 가장 가까운 단계로 |
| 체험 | 웹·앱 통틀어 **계정당 한 번** 7일 |
| 이중 구독 | 막을 수 있는 건 막고, 그래도 생기면 **나중에 시작한 결제를 해지하라고 안내** |
| 플랫폼 | iPhone 전용(iPad 정식 지원 안 함, 기존 결정) + Android |
| 출시 | 프리미엄 기능 셋이 모두 들어간 상태로 첫 출시 |

## 설계

### 1. 데이터 모델: 출처별 기록 + 합친 값

`entitlements/{uid}` **한 문서** 안에 출처별 기록을 맵 필드로 둔다. 기존 최상위 필드는 "합친 결과"로 유지해서 웹 클라이언트·운영자 스크립트가 그대로 읽게 한다.

```
entitlements/{uid}
  // ── 합친 결과(기존 필드, 의미 유지) ──
  plan, status, source, premiumUntil, cancelAt, currentPeriodEnd,
  customerId, subscriptionId,          // 대표 출처가 paddle일 때만 값(웹 포털용, 기존 의미)
  trialUsedAt,                          // 계정 단위. 출처와 무관
  updatedAt
  // ── 새 필드 ──
  sources: {
    paddle?:  SourceRecord   // + customerId, subscriptionId, lastWebhookEventId, lastEventOccurredAt
    apple?:   SourceRecord   // + originalTransactionId, productId, environment, lastNotificationUUID, lastSignedDate
    google?:  SourceRecord   // + purchaseToken, productId, basePlanId, lastMessageId, lastEventTime
    trial?:   SourceRecord   // 카드 없는 웹 체험
    manual?:  SourceRecord   // 운영자 부여
  }
  duplicate: null | { laterSource: "paddle"|"apple"|"google", detectedAt }

SourceRecord = { status, premiumUntil, cancelAt, currentPeriodEnd, autoRenew, updatedAt, ...출처별 식별자 }
```

**한 문서·맵 필드인 이유**: 기존 `commitEntitlement`는 문서 하나에 사전조건(updateTime)을 걸어 쓴다. 출처를 서브컬렉션으로 나누면 "합친 값"과 원자적으로 같이 쓸 수 없다. 맵이면 한 번의 사전조건 쓰기로 출처 기록과 합친 값을 같이 바꿀 수 있다.

**합치는 규칙 (`aggregate(doc, now)`)**
- `premiumUntil` = 모든 출처의 `premiumUntil` 중 최댓값(null 제외)
- **대표 출처** = 그 최댓값을 가진 출처(동률이면 paddle > apple > google > manual > trial)
- `status`·`source`·`cancelAt`·`currentPeriodEnd`는 대표 출처 값
- `plan`은 기존처럼 `premiumUntil > now`
- `customerId`·`subscriptionId`는 **paddle 기록의 값**(대표 출처와 무관): 웹 "구독 관리" 버튼(포털)은 Paddle 구독이 있을 때만 의미가 있기 때문
- `duplicate`: 자동 갱신 중(`autoRenew=true`, 해지 예약 아님)이고 아직 유효한 **결제 출처**(paddle·apple·google)가 둘 이상이면, 그중 **나중에 시작한 쪽**을 `laterSource`로 기록. 아니면 null

**이주**: 기존 문서는 `sources`가 없다. 읽을 때 `sources`가 없으면 최상위 필드(`source`가 paddle/trial/manual)를 그 출처 하나의 기록으로 간주한다. 다음 쓰기 때 `sources`가 채워진다. 일괄 이주 스크립트는 만들지 않는다(문서 수가 적고 읽기 시 변환으로 충분).

**Paddle 경로 변경**: `applySubscriptionEvent`는 문서 전체 대신 `sources.paddle`만 갱신하고, 마지막에 `aggregate`를 돈다. `isStaleEvent`(이벤트 순서)와 `isForeignCancel`(다른 Paddle 구독의 해지 무시)은 `sources.paddle` 기준으로 그대로 동작한다. 다른 출처(apple·google)의 상태는 Paddle 이벤트가 건드리지 않는다. 이것이 "한 출처의 해지가 다른 출처의 권한을 지우지 않는다"를 구조적으로 보장한다.

**EntitlementStore**: 지금은 문자열·null만 인코딩한다. 맵(`mapValue`)·불리언 인코딩을 추가한다. 읽기 시 알 수 없는 출처 키는 버린다.

### 2. 스토어 구독과 계정 연결

스토어 알림에는 우리 uid가 없다. 그래서 **연결 문서**를 둔다.

```
storeLinks/{store}_{id}            // apple_{originalTransactionId} | google_{purchaseToken}
  uid, linkedAt
```

- 앱에서 구매·복원이 끝나면 앱이 서명된 거래 정보를 billing-proxy에 보낸다(아래 3). 서버가 검증한 뒤 연결 문서를 만든다.
- 연결 문서가 **이미 다른 uid**를 가리키면 `409 LINKED_TO_OTHER_ACCOUNT`. 앱은 "이 구독은 다른 계정에서 사용 중이에요"를 보여준다. 한 스토어 구독은 계정 하나에만 연결된다.
- 알림이 왔는데 연결 문서가 없으면 200으로 받고 아무것도 안 한다(구매 직후 검증 요청보다 알림이 먼저 온 경우는 검증 요청이 반영한다. 탈퇴한 계정이면 무시가 맞다).
- Apple은 구매 시 `appAccountToken`을 붙인다. uid에서 결정적으로 만든 UUID(uid의 HMAC으로 만든 v4 형식 UUID, 키는 새 시크릿)다. Google은 구매 시 `obfuscatedAccountId`에 같은 방식의 값을 넣는다.
- **연결 판정 (설계자 판단, 사용자 확인 대상)**
  | 연결 문서 | 토큰 | 결과 |
  |---|---|---|
  | 없음 | 요청 uid와 일치 | 연결 |
  | 없음 | 불일치·없음 | **연결**(복원으로 취급) + 로그 |
  | 요청 uid | 무엇이든 | 갱신 |
  | 다른 uid | 무엇이든 | `409 LINKED_TO_OTHER_ACCOUNT` |
  - 토큰 불일치·없음을 거절하지 않는 이유: 앱 구독을 둔 채 탈퇴 후 재가입(새 uid, 옛 토큰), App Store에서 시작된 구매(오퍼 코드·프로모션, 토큰 없음)가 "결제했는데 영원히 못 씀"이 된다. Google은 verify 실패가 이어지면 acknowledge가 안 돼 3일 뒤 자동 환불된다.
  - 이래도 막히는 것: **이미 다른 계정에 연결된 구독**은 가져갈 수 없다(409). 남의 영수증을 쓰려면 그 구독이 어느 계정에도 연결돼 있지 않아야 하고, 서명된 거래 정보는 그 Apple ID·Google 계정으로 로그인한 기기에서만 나온다. 위험이 작다고 보고 사용성을 택한다.
  - 토큰은 연결 판정에 쓰지 않지만 기록·로그에 남겨 이상 사례를 추적한다.
- Google 구독은 업그레이드·재구독 때 `linkedPurchaseToken`으로 새 토큰이 이어진다. 새 토큰이 오면 이전 토큰의 연결을 따라가 같은 uid로 잇는다.
- 규칙: `storeLinks`는 `read,write: false`(서버만).

### 3. billing-proxy 새 엔드포인트

| 경로 | 인증 | 하는 일 |
|---|---|---|
| `POST /iap/apple/verify` | Firebase ID 토큰 | 앱이 StoreKit 2 `jwsRepresentation`(서명된 거래)을 보냄 → 서명 검증 → `appAccountToken` 확인 → 연결 문서 → App Store Server API로 최신 구독 상태 조회 → `sources.apple` 갱신 |
| `POST /iap/google/verify` | Firebase ID 토큰 | 앱이 `purchaseToken`·`productId`를 보냄 → Play Developer API `purchases.subscriptionsv2.get` → `obfuscatedAccountId` 확인 → 연결 → `sources.google` 갱신 → 미확인 구매면 acknowledge |
| `POST /webhooks/apple` | Apple JWS 서명 | App Store Server Notifications v2. `signedPayload`를 Apple 루트 인증서 체인으로 검증 → 연결 문서로 uid 찾기 → `sources.apple` 갱신 |
| `POST /webhooks/google` | Pub/Sub 푸시 OIDC 토큰 | RTDN. 메시지에서 `purchaseToken`을 얻어 `subscriptionsv2.get`으로 **현재 상태를 다시 조회**(알림 본문 상태는 믿지 않음) → `sources.google` 갱신 |

- 상태 갱신은 모두 기존 `commitEntitlement`(읽기 → 결정 → 클레임 → 사전조건 쓰기)를 그대로 쓴다. 결정 함수만 출처별로 새로 만든다.
- verify 엔드포인트가 응답할 때는 이미 클레임이 바뀌어 있다. 앱은 응답을 받으면 `getIdToken(true)`로 토큰을 새로 받는다. 이것이 "구매 직후 바로 켜짐"을 보장한다(알림을 기다리지 않음).
- **중복·순서**: Apple은 `notificationUUID`와 `signedDate`, Google은 Pub/Sub `messageId`와 `eventTimeMillis`로 출처 기록 안에서 Paddle과 같은 방식의 중복·역순 판정을 한다. 단 Google은 매번 현재 상태를 다시 조회하므로 순서가 바뀌어도 결과는 최신 상태로 수렴한다.
- **환경**: Apple 알림의 `environment`(Sandbox/Production)를 기록한다. 운영 Worker는 Sandbox 알림도 받되 기록만 하고 반영하지 않는다(TestFlight 사용자는 Sandbox다. 반영 여부는 아래 "빌더에게 맡기는 것"에서 결정). 
- 결제 허용 목록(`BILLING_ALLOWED_UIDS`)은 verify 엔드포인트에도 똑같이 적용한다(현재 운영 값은 `*`).
- **새 시크릿**: App Store Server API 키(.p8, Key ID, Issuer ID), 번들 id, `appAccountToken`용 HMAC 키, Google Play용 서비스 계정 권한(기존 `GOOGLE_SERVICE_ACCOUNT`에 Play Console 권한을 줄지 별도 계정을 둘지는 빌더 판단), Pub/Sub 푸시 인증용 서비스 계정 이메일·audience.

### 4. 출처별 상태 → `SourceRecord`

공통으로 `premiumUntil`은 **만료 시각 + 기존 `RENEWAL_GRACE_MS`(3일)**다. 토큰 갱신이 최대 1시간 늦어도 정상 갱신자가 경계에서 잠기지 않게 하려는 기존 이유가 그대로 적용된다.

| 상황 | Apple (알림 type / subtype) | Google (subscriptionState) | SourceRecord |
|---|---|---|---|
| 구매·갱신 | SUBSCRIBED, DID_RENEW | ACTIVE | `active`, `premiumUntil = expires + 3일` |
| 무료 체험 중 | 거래의 `offerType = introductory` | ACTIVE + 체험 offer 단계 | `trialing`, 같은 계산. **계정 `trialUsedAt` 기록** |
| 자동 갱신 끔(해지 예약) | DID_CHANGE_RENEWAL_STATUS / AUTO_RENEW_DISABLED | CANCELED(기간 남음) | `active`, `autoRenew=false`, `cancelAt = expires`, `premiumUntil = expires`(유예 없음) |
| 자동 갱신 다시 켬 | AUTO_RENEW_ENABLED | ACTIVE | `active`, `autoRenew=true`, `cancelAt=null` |
| 결제 실패·유예 | DID_FAIL_TO_RENEW (GRACE_PERIOD) | IN_GRACE_PERIOD | `past_due`, `premiumUntil = max(기존, 유예 만료 + 3일)` |
| 결제 실패·보류 | DID_FAIL_TO_RENEW (유예 없음) | ON_HOLD | `past_due`, `premiumUntil = 지금`(이용 중지, 재결제되면 복귀) |
| 만료 | EXPIRED, GRACE_PERIOD_EXPIRED | EXPIRED | `canceled`, `premiumUntil = 지금` |
| 환불·취소 | REFUND, REVOKE | 환불 후 EXPIRED, `SUBSCRIPTION_REVOKED` | `canceled`, `premiumUntil = 지금` |

- 앱 결제 실패 유예는 스토어의 유예 기간 기능(Apple Billing Grace Period, Google 유예 기간)을 켜고 그 기간을 따른다. 웹 Paddle의 "past_due 동안 유지"와 같은 생각이다.
- 환불은 **그 출처만** 회수한다. 다른 출처가 유효하면 합친 `premiumUntil`은 그대로다.

### 5. 체험: 웹·앱 합쳐 계정당 한 번

- 계정 `trialUsedAt`가 기준이다. 웹 `/trial`, Apple 체험 구매, Google 체험 구매가 모두 이 값을 확인하거나 기록한다.
- **Apple**: 같은 구독 그룹에 상품 두 개를 둔다. 둘 다 월 4,900원 자동 갱신이다.
  - `premium_monthly_trial`: 소개 혜택 7일 무료
  - `premium_monthly`: 소개 혜택 없음
  - 앱은 `trialUsedAt == null`이고 StoreKit `isEligibleForIntroOffer`도 참일 때만 체험 상품을 보여준다. 아니면 체험 없는 상품을 보여준다.
  - Apple은 같은 Apple ID로 그룹 안에서 체험을 한 번만 주므로, Apple 쪽 판단은 우리보다 엄격하거나 같다.
- **Google**: 상품 하나, 기본 요금제 하나, 체험 혜택(offer) 하나. 앱은 `trialUsedAt == null`일 때만 체험 offer 토큰으로 구매를 시작한다.
- 서버는 앱 체험 구매를 반영할 때 `trialUsedAt`가 비어 있으면 채운다. 이미 차 있는데 체험 구매가 들어왔으면(앱 화면이 낡았던 경우 등) 막지 않고 반영한다. 스토어가 이미 결제 정보를 받았고, 7일 뒤 정상 과금되기 때문이다.
- 웹 `/trial`은 이제 "어떤 출처로든 프리미엄이면 거절(`ALREADY_PREMIUM`)", "`trialUsedAt` 있으면 거절" 그대로다.
- **앱에서는 웹의 카드 없는 체험(`/trial`)을 노출하지 않는다.** 앱 내 디지털 혜택을 IAP 밖에서 주는 것으로 보일 수 있다(3.1.1).

### 6. 이중 구독

- **미리 막기**
  - 앱 결제 화면: 합친 `premiumUntil`이 유효하면 결제 버튼 대신 "이미 프리미엄이에요"와 현재 출처에 맞는 관리 안내를 보여준다.
  - 웹 결제 화면: 같은 원칙. 대표 출처가 apple/google이면 "App Store(또는 Google Play)에서 구독 중이에요. 구독 관리는 해당 스토어에서 할 수 있어요"를 보여주고, 체크아웃 버튼은 숨긴다.
  - verify·체크아웃 서버 쪽에서는 막지 않는다. 스토어 결제는 이미 일어난 일이라 거절할 수 없고, 막으면 "돈은 냈는데 반영 안 됨"이 된다.
- **그래도 생기면**: 합친 결과의 `duplicate.laterSource`가 채워진다. 앱과 웹이 이 값을 보고 배너를 띄운다.
  - `laterSource`가 apple/google: "구독이 두 군데서 결제되고 있어요. 나중에 시작한 App Store(Google Play) 구독을 해지해 주세요" + (앱에서) 스토어 구독 관리 화면 열기 버튼. 웹에서는 문구만 보여준다.
  - `laterSource`가 paddle: 웹에서는 "나중에 시작한 웹 구독을 해지해 주세요" + 구독 관리(포털) 버튼. **앱에서는 웹 결제를 언급할 수 없으므로** 문구를 "구독이 두 군데서 결제되고 있어요. 다른 기기나 웹에서 구독 관리를 확인해 주세요" 수준으로 중립화하거나 배너를 앱에서 띄우지 않는다. 어느 쪽인지는 빌더 판단이지만 3.1.3 위반이 되면 안 된다.
- 하나를 해지하면 합친 `premiumUntil`은 남은 구독 기준으로 끊김 없이 이어진다.

### 7. 탈퇴

- 앱·웹 탈퇴 화면은 `sources.apple` 또는 `sources.google`이 **자동 갱신 중**이면, 탈퇴 전에 경고를 보여준다: "App Store(Google Play) 구독은 탈퇴해도 자동으로 해지되지 않아요. 먼저 구독을 해지해 주세요." 앱에서는 스토어 구독 관리 화면 열기 버튼을 함께 둔다.
- 경고는 막는 게 아니라 안내다. 확인 후 탈퇴는 계속 진행할 수 있다.
- 서버 `/account/delete`: Paddle 즉시 해지는 지금처럼 한다. 그 사용자의 `storeLinks` 문서도 지운다(Firestore 데이터 삭제 단계에 포함). 탈퇴 뒤 오는 스토어 알림은 연결 문서가 없으므로 무시된다.

### 8. 앱 클라이언트

- **구매 라이브러리**: StoreKit 2와 Google Play Billing 최신 버전을 지원하는 Expo 호환 라이브러리(예: `expo-iap` 또는 `react-native-iap` 최신 메이저). 개발 빌드(dev client) 필요, Expo Go 불가. 선택은 빌더 판단이다(아래).
- **구독 상태 읽기**: 웹 `client/src/features/entitlement/`와 같은 구조를 앱에 둔다. `entitlements/{uid}` onSnapshot + 클레임 불일치 시 `getIdToken(true)`. 공통 타입·`isPremiumEntitlement`·`aggregate` 결과 해석은 `@tododo/core`로 옮겨 웹·앱이 같은 코드를 쓴다.
- **화면** (내 정보/설정 탭 안 "프리미엄" 영역)
  - 비구독: 혜택 설명 + 체험 또는 구독 버튼(5절 규칙) + **구매 복원** 버튼 + 이용약관·개인정보처리방침 링크와 자동 갱신 고지(Apple 3.1.2 필수 문구)
  - 구독 중: 다음 결제일 또는 종료일 + 현재 출처에 따른 관리 버튼(apple/google: 스토어 구독 관리 열기 / paddle: "다른 기기나 웹에서 관리할 수 있어요" 같은 중립 문구, 링크 없음)
  - 결제 실패: "결제 수단을 확인해 주세요" + 스토어 관리 열기
  - 이중 구독 배너(6절)
- **구매 흐름**: 구매 → 거래 완료 콜백 → `/iap/*/verify` → 성공 시 `getIdToken(true)` → (Android) 서버가 acknowledge → 앱이 거래 finish. 검증 실패 시 거래를 finish하지 않아 다음 실행 때 재시도된다.
- **앱 시작 시**: 미처리 거래가 있으면 verify를 다시 보낸다.
- 프리미엄 기능 화면(AI 플랜·캘린더·통계)의 게이트 모양은 2~4 설계에서 정한다. 이 문서는 `useIsPremium()` 같은 판단 훅만 제공한다.

### 9. 운영자 부여 스크립트

`scripts/grantEntitlement.ts`는 지금 최상위 필드를 merge로 쓴다. `sources`가 생기면 그 값이 다음 `aggregate`에 덮인다. 그래서 (설계자 판단):

- 스크립트는 `sources.manual`만 쓰고 `aggregate`를 돌린 결과로 문서와 클레임을 같이 쓴다. `aggregate`·인코딩은 billing-proxy와 같은 코드를 쓴다(공유 위치는 빌더 판단).
- `--plan free`는 **manual 출처만 회수**한다. 다른 출처(결제)로 프리미엄이면 계속 프리미엄이다. 결제 출처를 강제로 끄는 운영 수단은 만들지 않는다(필요하면 스토어·Paddle에서 환불·해지하면 알림으로 회수된다).

### 10. 웹 클라이언트 변경

- 타입에 `sources`·`duplicate` 추가.
- `premiumView`: 대표 출처가 apple/google이면 "스토어에서 구독 중" 보기(체크아웃·포털 버튼 없음, 관리 안내 문구). 체험 가능 여부는 계정 `trialUsedAt` 그대로.
- 이중 구독 배너, 탈퇴 경고(7절).

## 선행 조건 (사용자 몫)

- [ ] Apple Developer Program 가입 → 유료 앱 계약·세금·은행 정보 → **소규모 사업자 프로그램 신청**
- [ ] App Store Connect: 구독 그룹 1개, 상품 2개(5절), 4,900원 가격 단계 확인, Billing Grace Period 켜기, 가족 공유 끄기, Server Notifications v2 URL(운영·샌드박스) 등록, App Store Server API 키 발급
- [ ] Google Play Console 가입($25) → 판매자 계정·결제 프로필 → 구독 상품·기본 요금제·7일 체험 offer, 유예 기간 켜기
- [ ] Google Cloud: Pub/Sub 토픽 + billing-proxy로 푸시하는 구독(OIDC 인증), Play Console에 서비스 계정 권한(재무 데이터 보기·주문/구독 관리)
- [ ] 시크릿 등록은 사용자의 진짜 터미널에서 `wrangler secret put`

계정이 없어도 **서버 로직·데이터 모델·웹 변경·앱 화면은 먼저 구현**할 수 있다. 실제 결제 검증(샌드박스 구매, 실제 알림 수신)은 계정이 생긴 뒤에 한다.

## 테스트

- **단위**: `aggregate`(출처 조합별 최댓값·대표 출처·duplicate), 출처별 결정 함수(4절 표 전 행), 이주(sources 없는 문서), Paddle 기존 테스트 전부 그대로 통과, 체험 계정당 한 번(웹→앱, 앱→웹 순서 둘 다)
- **서명 검증**: Apple JWS 체인(정상·체인 불일치·만료), Pub/Sub OIDC(정상·audience 불일치), `appAccountToken`/`obfuscatedAccountId` 불일치 시 거절
- **연결**: 다른 uid에 연결된 구독 → 409, Google `linkedPurchaseToken` 이어붙이기, 탈퇴 후 알림 무시
- **커밋 순서**: 클레임 먼저, 문서 충돌 재시도, 웹훅 500 → 재전송 수렴(기존 패턴)
- **실측(계정 생긴 뒤)**: Apple 샌드박스(가속 갱신 주기)로 구매→갱신→해지 예약→만료→환불, Google 테스트 트랙 동일, 웹 구독 + 앱 구독 동시(이중 구독 배너), 구매 직후 토큰 갱신으로 바로 프리미엄

## 빌더에게 맡기는 것

- 앱 구매 라이브러리 선택(StoreKit 2·Play Billing 최신 지원, Expo 57 호환이 조건)
- Apple JWS 검증 구현(Apple 공식 라이브러리를 Workers에서 쓸 수 있는지, 아니면 WebCrypto로 직접)
- Google Play API용 서비스 계정을 기존 것에 권한 추가할지 별도로 둘지
- 운영 Worker가 Sandbox 알림·TestFlight 구매를 반영할지(심사관은 Sandbox로 구매한다. 반영하지 않으면 심사관이 프리미엄 기능을 못 본다 → **반영하는 쪽이 기본값으로 보인다**, 대신 `environment`를 출처 기록에 남김)
- 앱 이중 구독 배너에서 Paddle이 나중인 경우 문구(6절, 3.1.3 위반 금지가 조건)
- 코드 배치: billing-proxy 안 모듈 구조, `@tododo/core`로 옮길 범위
- 이중 구독 "나중 시작" 판정에 필요한 출처별 시작 시각 필드(`startedAt` 등) 추가
- `handleCheckout`의 기존 `ALREADY_SUBSCRIBED` 판정을 `sources.paddle` 기준으로 옮기기
- 탈퇴 시 `storeLinks` 삭제는 `uid` 필드 쿼리로
