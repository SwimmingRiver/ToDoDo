# billing-proxy

프리미엄 결제/구독(Paddle Billing) Worker. 스펙: `docs/superpowers/specs/2026-10-04-premium-billing-paddle-design.md`

| 경로 | 인증 | 설명 |
|---|---|---|
| `POST /checkout` | Firebase ID 토큰 | 서버가 Paddle 거래 생성 → `{ transactionId }` |
| `POST /trial` | Firebase ID 토큰 | 카드 없는 7일 체험(계정당 1회) |
| `POST /portal` | Firebase ID 토큰 | Paddle 고객 포털 URL |
| `POST /webhooks/paddle` | `Paddle-Signature` | `subscription.created/updated/canceled` 반영 |
| `POST /account/delete` | Firebase ID 토큰 | 회원 탈퇴(허용 목록과 무관). 순서: 살아 있는 Paddle 구독 즉시 해지 → 자동 갱신 중인 Google Play 구독 `subscriptionsv2.cancel`(갱신 중지, 이미 해지·만료면 성공으로 봄) → 데이터 삭제 → Auth 삭제. 해지 실패면 아무것도 지우지 않고 `502 PADDLE_CANCEL_FAILED`/`502 GOOGLE_CANCEL_FAILED`. Apple 구독은 서버가 해지할 수 없어 화면 경고만 한다 |
| `POST /iap/account-token` | Firebase ID 토큰 | 앱이 구매 때 붙일 `appAccountToken` |
| `POST /iap/apple/verify` | Firebase ID 토큰 | 본문 `{ jws }`(StoreKit 2 `jwsRepresentation`) 검증 → 영수증을 계정에 연결 → App Store Server API(거래의 `environment`가 Sandbox면 샌드박스 API)로 현재 상태 조회 → `sources.apple` 반영 → `{ premiumUntil }`. 실패 `400 INVALID_TRANSACTION`, 다른 계정에 연결됨 `409 LINKED_TO_OTHER_ACCOUNT` |
| `POST /iap/google/verify` | Firebase ID 토큰 | 본문 `{ purchaseToken, productId }`(`productId`는 `premium_monthly`만) → Play Developer API `subscriptionsv2`로 현재 상태 조회 → 구매 토큰을 계정에 연결(교체 토큰이면 `linkedPurchaseToken`의 연결이 같은 계정이어야 함) → `sources.google` 반영 → 미승인이면 acknowledge → `{ premiumUntil }`. 결제 대기면 승인 없이 `{ premiumUntil, pending: true }`. 실패 `400 INVALID_PURCHASE`, 다른 계정에 연결됨 `409 LINKED_TO_OTHER_ACCOUNT`, 다른 Google 구독이 갱신 중 `409 ALREADY_SUBSCRIBED`(승인 안 함 → 자동 환불), 승인 실패 `500`(반영은 같은 값이라 앱이 재시도하면 승인까지 이어짐) |
| `POST /webhooks/google` | Pub/Sub 푸시 OIDC 토큰 | Play RTDN. 알림 본문 상태는 믿지 않고 `purchaseToken`으로 매번 다시 조회해 반영(구독 환불 `voidedPurchaseNotification`(`productType` 1)도 같음, 다른 상품 환불은 무시). 연결된 계정에만 반영(교체 토큰은 이전 토큰의 계정을 따라가 새로 연결, 둘 다 없으면 200 무시), 반영했는데 미승인이면 승인. OIDC 불일치 401, 형식 오류·다른 앱·테스트 알림 200, 일시 오류 500(Pub/Sub 재전송) |
| `POST /webhooks/apple` | Apple JWS 서명 | App Store Server Notifications v2. 알림은 신호로만 쓰고 상태는 매번 App Store Server API로 다시 조회한다(알림의 거래는 지난 갱신분일 수 있음). 연결된 계정에만 반영(연결 없으면 200 무시), 서명 불일치 401, 일시 오류 500(Apple 재전송). `CONSUMPTION_REQUEST`(환불 요청)는 권한을 바꾸지 않고 결제일 14일 이내면 `GRANT_FULL`, 지나면 `DECLINE`으로 회신한다(`APPLE_CONSUMPTION_REPLY_ENABLED="true"`일 때만, 실패해도 200) |

## 배포 준비 (사용자 작업 — 비밀값은 본인 터미널에서)

1. **Paddle 샌드박스**(sandbox-vendors.paddle.com)
   - Catalog: 상품 "ToDoDo 프리미엄" + 월간 KRW 가격 **₩4,900, 세금 포함(tax inclusive)** — 클라이언트 표시 가격 `PREMIUM_MONTHLY_PRICE_LABEL`과 같아야 한다 → `pri_…`를 `wrangler.toml`의 `PADDLE_PRICE_ID`에.
   - 설정 > Authentication(`/settings/authentication`): API 키(→ `PADDLE_API_KEY`, 권한은 Transactions·Customer portal sessions Write + 회원 탈퇴의 즉시 해지·상태 조회용 Subscriptions Read·Write — 빠지면 구독 중 사용자의 탈퇴가 `502 PADDLE_CANCEL_FAILED`), Client-side token(→ 클라이언트 `VITE_PADDLE_CLIENT_TOKEN`, `test_`로 시작). **API 키는 만료일이 있다**(현재 샌드박스 키 2027-01-06 만료) — 만료 전에 새 키를 만들어 `wrangler secret put PADDLE_API_KEY`로 교체하지 않으면 `/checkout`·`/portal`이 그날부터 실패한다.
   - Checkout > Checkout settings: Default payment link = `https://tododo-83576.web.app` (transactionId로 결제창을 열려면 필수).
   - Notifications(`/notifications-v2`, Usage type은 Platform+Simulation): 대상 URL `https://tododo-billing-proxy.<subdomain>.workers.dev/webhooks/paddle`, 이벤트 `subscription.created`·`subscription.updated`·`subscription.canceled` → secret key(→ `PADDLE_WEBHOOK_SECRET`).
2. **GCP 결제 전용 서비스 계정**(reminder-proxy 계정과 별도): 역할 `Cloud Datastore User` + `Firebase Authentication Admin` → JSON 키.
3. **시크릿 등록** (`cd billing-proxy`). `BILLING_UID_SECRET`은 32바이트 이상 무작위 값(`openssl rand -hex 32`) — `/checkout`이 `custom_data.uid`에 붙이는 서명 키로, 웹훅은 이 서명이 맞는 uid만 반영한다(공개 클라이언트 토큰으로 남의 uid를 넣은 결제 위조 차단). **한 번 정하면 회전하지 않는다** — 서명은 거래의 `custom_data`를 통해 구독에 영구 저장되므로, 키를 바꾸는 순간 기존 구독 전부의 갱신·해지 웹훅이 서명 불일치로 버려진다(200으로 응답해 Paddle도 재전송하지 않음). 그러면 구독자는 기간 끝+3일에 잠기고 해지도 반영되지 않는다. 유출 등으로 꼭 바꿔야 하면 먼저 이전 키도 함께 검증하도록 코드를 고친 뒤 교체한다:
   ```bash
   npx wrangler secret put PADDLE_API_KEY
   npx wrangler secret put PADDLE_WEBHOOK_SECRET
   openssl rand -hex 32 | npx wrangler secret put BILLING_UID_SECRET
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT < ~/billing-service-account.json
   ```
4. 첫 배포는 수동 `npx wrangler deploy`로 확인하고, 이후는 main push 시 CI가 배포한다.

## 인앱결제(Apple) 설정 (사용자 작업 — 비밀값은 본인 터미널에서)

스펙: `docs/superpowers/specs/2026-11-18-mobile-iap-design.md`. 번들 id는 `wrangler.toml`의 `APPLE_BUNDLE_ID`(`com.swimmingriver.tododo`)다.

1. **App Store Server API 키**: App Store Connect > 사용자 및 액세스 > 통합 > App Store Connect API의 **인앱 구입** 키를 만든다 → `.p8` 파일(한 번만 내려받을 수 있다), Key ID, Issuer ID.
2. **서버 알림 URL**: App Store Connect > 앱 > 앱 정보 > App Store 서버 알림에서 **버전 2**로 운영·샌드박스 둘 다 `https://tododo-billing-proxy.<subdomain>.workers.dev/webhooks/apple`(자체 도메인이면 그 주소)을 넣는다. 샌드박스 알림(TestFlight·심사 결제)도 반영하고 `sources.apple.environment`에 `Sandbox`로 기록한다. 등록 후 App Store Server API의 "테스트 알림 요청"을 보내면 `TEST` 알림이 200으로 끝나는지 `wrangler tail`로 확인한다.
3. **시크릿 등록** (`cd billing-proxy`). `IAP_ACCOUNT_TOKEN_SECRET`은 `appAccountToken`(uid 기반 UUID)을 만드는 키다 — **한 번 정하면 바꾸지 않는다**(바꾸면 기존 구매의 토큰과 달라진다. 연결은 막지 않지만 불일치 로그가 쏟아진다). Issuer ID·Key ID는 비밀은 아니지만 계정 고유 값이라 저장소에 두지 않는다:
   ```bash
   openssl rand -hex 32 | npx wrangler secret put IAP_ACCOUNT_TOKEN_SECRET
   npx wrangler secret put APPLE_ISSUER_ID
   npx wrangler secret put APPLE_KEY_ID
   npx wrangler secret put APPLE_PRIVATE_KEY < ~/SubscriptionKey_XXXXXXXXXX.p8   # 인앱 구입 키는 SubscriptionKey_<Key ID>.p8로 내려받아진다
   ```
4. **환불 요청 회신**(`CONSUMPTION_REQUEST`): 사용자가 Apple에 환불을 요청하면 알림이 오고, 우리는 App Store Server API "Send Consumption Information"(`PUT /inApps/v2/transactions/consumption/{transactionId}`)으로 환불 선호를 회신한다. 기준은 웹·Google과 같은 **결제일(이 거래의 `purchaseDate`, 갱신분이면 갱신일) 14일 이내 → `GRANT_FULL`, 지나면 `DECLINE`**(정확히 14일은 기간 안)이다. 판단이 결제일만으로 정해지므로 계정 연결이 없어도(탈퇴한 계정 포함) 회신하고, 권한은 바꾸지 않는다 — 실제 환불되면 뒤따르는 `REFUND` 알림이 회수한다. 회신이 실패해도 알림은 200으로 받는다(로그만).
   - Apple은 **고객 동의(`customerConsented: true`) 없이는 회신하지 말라**고 한다(`true`가 아니면 400). 그래서 `wrangler.toml`의 `APPLE_CONSUMPTION_REPLY_ENABLED`가 `"true"`가 아니면 회신하지 않고 `환불 회신 비활성(동의 고지 전)` 로그만 남긴다. 개인정보처리방침에 "환불 요청 시 Apple에 이용 정보 제공"을 고지한 릴리스에서 `"true"`로 바꾼다.

## 인앱결제(Google Play) 설정 (사용자 작업 — 비밀값은 본인 터미널에서)

스펙: `docs/superpowers/specs/2026-11-18-mobile-iap-design.md`. 패키지명은 `wrangler.toml`의 `GOOGLE_PLAY_PACKAGE_NAME`(`com.swimmingriver.tododo`)이다. 상품 `premium_monthly`, 기본 요금제 `monthly`, 체험 offer `free-trial-7d`.

1. **Play 전용 서비스 계정**(결제용 `GOOGLE_SERVICE_ACCOUNT`와 별도 — Firestore·Auth 권한을 주지 않는다): GCP에서 서비스 계정을 만들고 JSON 키를 내려받는다. 그 GCP 프로젝트에서 **Google Play Android Developer API**를 사용 설정한다. Play Console > 사용자 및 권한에서 그 서비스 계정 이메일을 초대하고, 앱 권한으로 **재무 데이터 보기**와 **주문 및 구독 관리**를 준다(구독 조회 `subscriptionsv2.get`·승인 `acknowledge`·탈퇴 시 해지 `subscriptionsv2.cancel`에 필요). 권한 반영에 시간이 걸릴 수 있어 처음 몇 시간은 `401/403`이 날 수 있다.
2. **Pub/Sub 토픽**: 같은 GCP 프로젝트에 토픽(예: `play-rtdn`)을 만들고, 토픽 권한에 `google-play-developer-notifications@system.gserviceaccount.com`을 **Pub/Sub 게시자**로 추가한다.
3. **푸시 구독**: 그 토픽에 구독을 만들고 전송 유형 **푸시**, 엔드포인트 `https://tododo-billing-proxy.<subdomain>.workers.dev/webhooks/google`(자체 도메인이면 그 주소). **인증 사용**을 켜고 토큰을 서명할 서비스 계정(푸시 전용으로 하나 만든다)과 **audience**(엔드포인트 URL을 그대로 쓰면 된다)를 정한다 — 이 두 값이 아래 `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL`·`GOOGLE_PUBSUB_AUDIENCE`다. 프로젝트의 Pub/Sub 서비스 에이전트(`service-<프로젝트번호>@gcp-sa-pubsub.iam.gserviceaccount.com`)에 그 서비스 계정에 대한 **서비스 계정 토큰 생성자** 역할이 있어야 한다.
4. **RTDN 연결**: Play Console > 앱 > 수익 창출 설정 > 실시간 개발자 알림에 토픽 이름(`projects/<프로젝트>/topics/play-rtdn`)을 넣고 **테스트 알림 보내기**로 `testNotification`이 200으로 끝나는지 `wrangler tail`로 확인한다.
5. **시크릿 등록** (`cd billing-proxy`). audience·이메일은 비밀은 아니지만 계정 고유 값이라 저장소에 두지 않는다:
   ```bash
   npx wrangler secret put GOOGLE_PLAY_SERVICE_ACCOUNT < ~/play-service-account.json
   npx wrangler secret put GOOGLE_PUBSUB_AUDIENCE
   npx wrangler secret put GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL
   ```
   `IAP_ACCOUNT_TOKEN_SECRET`은 Apple과 같은 값을 쓴다(앱이 `obfuscatedAccountId`에 넣는 값도 이 키로 만든다).

승인(acknowledge)은 반영(`sources.google` 기록)이 끝난 구매에만 한다 — 승인하지 않은 구매는 3일 뒤 Google이 자동 환불한다. 앱의 `/iap/google/verify`가 기본으로 승인하고, 결제 대기였다가 완료된 구매처럼 앱이 다시 verify하지 않는 경우를 위해 RTDN도 연결된 구매를 반영한 뒤 미승인이면 승인한다(실패는 500 → Pub/Sub 재전송). 다른 Google 구독이 계속 갱신 중이면(이중 구독) verify는 `409 ALREADY_SUBSCRIBED`로 승인하지 않아 새 구매가 자동 환불되게 둔다. 기존 구독이 해지 예약·자동 갱신 꺼짐이면 새 구매가 후속 구독으로 기록을 교체한다.

## 탈퇴 후 재가입 체험 재지급 방지 (사용자 작업)

체험을 쓴 계정이 탈퇴하면 로그인 계정 식별자(google.com·apple.com)를 HMAC한 값을 Firestore `trialHistory`에 1년 남기고, 같은 계정으로 다시 가입하면 웹 `/trial`이 `409 TRIAL_ALREADY_USED`로 거절한다. 약관·방침 4판(2026-12-28 시행) 이후 탈퇴부터 기록한다. 설계: `docs/superpowers/specs/2026-11-22-trial-reuse-after-deletion-design.md`.

1. 비밀키 — **운영 Worker에만** 등록한다(프리뷰 버전도 운영 Firestore를 쓰므로 프리뷰에 넣으면 테스트 탈퇴가 실제 기록을 남긴다). 없으면 기록·조회를 건너뛴다.
   ```bash
   openssl rand -hex 32 | npx wrangler secret put TRIAL_HMAC_SECRET
   ```
   **바꾸지 않는다** — 문서 id가 이 키로 만든 값이라 바꾸면 기존 기록을 모두 못 찾는다.
2. 1년 뒤 만료 — 코드가 조회할 때 `expireAt`을 직접 비교해 지난 기록은 없는 것으로 본다. **Firestore TTL은 쓰지 않는다**: 결제 연결(Blaze) 프로젝트에서만 되는데 이 프로젝트는 무료(Spark)라, `firestore.indexes.json`에 넣었더니 CI 배포가 `403 billing disabled`로 실패했다(2026-11-22). 만료 문서의 실제 삭제는 **2027-12-28(첫 기록 만료) 전까지** 별도 정리 작업(예: billing-proxy 예약 실행)으로 만든다.
3. 로컬 `.dev.vars`로 실검증했다면 테스트 후 생긴 `trialHistory` 문서를 지운다.

### 릴리스(develop→main) 전제

- `PADDLE_PRICE_ID` placeholder 교체 완료 + 샌드박스 실측(Task 11) 완료 **후에만** 릴리스 PR을 연다. main CI의 `billing-proxy` job은 placeholder면 실패하는데, `deploy` job(rules·클라이언트)은 이 job을 기다리지 않아 rules·클라이언트만 먼저 나가 버린다.
- 릴리스 직후 운영자 계정에 `npm run grant:entitlement`(루트)를 다시 실행한다.
- Apple/Google 스토어 시크릿은 스토어 계정 준비 전까지 비워도 된다(스토어 경로만 실패). `IAP_ACCOUNT_TOKEN_SECRET`·`APPLE_*`·`GOOGLE_PLAY_SERVICE_ACCOUNT`·`GOOGLE_PUBSUB_*`가 없으면 `/iap/*`·`/webhooks/apple`·`/webhooks/google`만 500이고, Paddle 웹훅·`/checkout`·`/portal`·`/trial`·`/account/delete`는 그대로 동작한다. 단, 자동 갱신 중인 Google 구독이 있는 사용자의 `/account/delete`는 `GOOGLE_PLAY_SERVICE_ACCOUNT`가 없으면 해지할 수 없어 `502 GOOGLE_CANCEL_FAILED`로 멈춘다(아무것도 지우지 않음).

## 로컬·프리뷰 테스트

Paddle 없이 로컬에서: `.dev.vars`에 결제용 서비스 계정 JSON(`GOOGLE_SERVICE_ACCOUNT='{"type":...}'` — 작은따옴표로 원문 그대로, 큰따옴표로 감싸면 wrangler가 `\"`를 풀지 않아 파싱 실패), 아무 값의 `PADDLE_WEBHOOK_SECRET`·`BILLING_UID_SECRET`, 테스트 계정 uid의 `BILLING_ALLOWED_UIDS`를 넣고 `npx wrangler dev`(값을 바꾸면 재시작). 그 뒤 `node scripts/sendTestWebhook.mjs <uid> <active|cancel-scheduled|past-due|canceled|forged-sig|trialing> [--sub id]`로 서명된 가짜 웹훅을 보내 클레임·문서 반영과 클라이언트 실시간 갱신을 확인한다. 클라이언트는 `VITE_BILLING_ENABLED=true VITE_BILLING_PROXY_URL=http://localhost:8787 npm run dev`. 로컬도 **운영 Firestore·Auth에 쓴다** — 반드시 테스트 계정으로. 가짜 웹훅은 `customerId: "ctm_local_test"`를 남기므로, 같은 계정으로 샌드박스 결제를 하기 전에 그 계정 `entitlements` 문서의 `customerId`·`subscriptionId`를 비운다(남아 있으면 `/checkout`이 Paddle `400 bad_request`).

Paddle 웹훅은 localhost에 닿지 않는다. `npx wrangler versions upload`로 만든 프리뷰 URL을 샌드박스 Notification 대상으로 임시 등록하고, 클라이언트는 `VITE_BILLING_PROXY_URL`을 그 URL로 덮어써 테스트한다. `past_due`·즉시 해지는 Paddle 대시보드의 웹훅 시뮬레이터로 보낸다.

**실결제 전환 후(wrangler.toml이 live 값)**: 로컬 `wrangler dev`는 `.dev.vars`에 `PADDLE_API_BASE="https://sandbox-api.paddle.com"`, `PADDLE_PRICE_ID="pri_01m4cvyj30dk394r30q3dy8frq"`(샌드박스 가격)와 샌드박스 API 키를 넣어 덮어쓴다 — 빠뜨리면 로컬이 live API를 부른다. 운영 Worker의 시크릿은 live 값이라 `versions upload` 프리뷰로 샌드박스 실결제를 다시 하려면 `--var`로 두 값을 덮어쓰는 것만으로는 부족하다(키·웹훅 secret도 샌드박스여야 함) — 전환 후 확인은 live에서 별도 계정으로 한다(1회용 100% 할인 코드, 또는 실결제 후 대시보드에서 환불·해지).

샌드박스 결제 테스트는 운영자 계정(2099년까지 수동 부여)이 아니라 **별도 테스트 계정**으로 한다(허용 목록에 그 uid를 임시로 추가). 운영자 계정으로 결제하면 수동 부여가 구독 기간으로 덮어써진다 — 이미 했다면 `npm run grant:entitlement`(루트)를 다시 실행한다. 테스트가 끝나면 **그 테스트 구독을 먼저 해지하고 나서** 허용 목록에서 uid를 뺀다 — 웹훅도 허용 목록을 확인하므로, 순서를 바꾸면 해지 웹훅이 버려져 테스트 계정이 마지막 `premiumUntil`(+3일)까지 프리미엄으로 남는다.

## 실결제 전환

Paddle 운영 계정 승인 → `PADDLE_API_BASE=https://api.paddle.com`, 운영 키·가격 id·웹훅 secret·클라이언트 토큰 교체 → `BILLING_ALLOWED_UIDS="*"` → 클라이언트 `VITE_BILLING_ENABLED=true` → `.github/workflows/ci.yml` deploy job의 `VITE_PADDLE_ENV: sandbox`를 `production`으로. (코드·설정 쪽은 전환 PR에서 반영 — live 가격 `pri_01m7mjk5660b9xxvvb5ken0d6d`)

**전환 순서**(시크릿과 코드가 어긋난 시간을 최소화): ① live 계정 인증 `completed`·도메인 승인 확인 → ② Worker 시크릿 `PADDLE_API_KEY`·`PADDLE_WEBHOOK_SECRET`를 live 값으로 교체(이때는 허용 목록 계정만 영향) → ③ GitHub Secrets `VITE_PADDLE_CLIENT_TOKEN`을 `live_…`로 교체 → ④ 전환 PR develop 병합 → 릴리스 PR main 병합(CI가 Worker·클라이언트 배포) → ⑤ 별도 계정으로 live 실결제 확인(1회용 100% 할인 코드 또는 실결제 후 환불), `wrangler tail`에 `PADDLE_PRICE_ID가 아님`이 없는지 확인. `BILLING_UID_SECRET`은 바꾸지 않는다.

**함정 — 가격 id는 반드시 live 값으로 함께 바꾼다.** 웹훅은 새로 들어오는 구독(문서가 추적 중이 아닌 구독)의 항목(`items[].price.id`)에 `PADDLE_PRICE_ID`가 없으면 반영하지 않고 `500`을 돌려준다. 샌드박스 가격 id를 그대로 두면 live 결제가 전부 이 경로로 빠진다 — 전환 직후 로그에 `구독 가격이 PADDLE_PRICE_ID가 아님`이 보이면 즉시 가격 id를 고쳐 재배포한다. `500`이라 Paddle 재전송이 남아 있는 동안 고치면 놓친 결제가 자동으로 반영된다.

**가격을 바꿀 때**(인상·새 가격): `PADDLE_PRICE_ID`를 새 가격으로 바꿔도 이미 추적 중인 구독은 가격을 다시 확인하지 않으므로 기존 가입자의 갱신·해지는 계속 반영된다.

`*`로 열기 전 보강(2026-11 완료):
- 웹훅이 새로 들어오는 구독의 가격이 `PADDLE_PRICE_ID`인지 확인한다 — `uid_sig`는 uid만으로 정해져 재사용할 수 있으므로, 공개 클라이언트 토큰으로 Paddle.js 결제창을 직접 열어 카탈로그의 다른 가격으로 결제하는 길을 막는다.
- 추적 중인 구독이 유효한 동안 다른 구독의 `past_due`도 해지·일시정지처럼 무시한다(`isForeignCancel`) — 반영하면 추적 대상이 바뀌어 그 구독의 해지가 살아 있는 구독의 권한까지 회수한다.

## 알려진 한계

- 즉시 해지된 사용자가 이미 받은 ID 토큰은 만료(최대 1시간)까지 서버 접근이 가능하다.
- 웹훅이 3일 넘게 실패하면 정상 구독자도 유예가 끝나 잠길 수 있다.
- 이중 구독(두 결제가 모두 성립)이면 문서는 한 구독만 추적한다. 추적 중인 구독이 유효한 동안 다른 구독의 해지·일시정지·결제 실패(`past_due`) 이벤트는 무시하고 경고 로그(`이중 구독 의심`)만 남긴다 — 이중 결제 자체는 Paddle 대시보드에서 환불 처리한다. 그 결과, 추적 중인 구독을 해지할 때 다른 구독이 결제 재시도(`past_due`) 중이면 그 사용자는 잠긴다(재시도가 성공해 `active`가 오면 다시 열린다). 구독을 하나만 추적하는 구조의 한계로 감수한다 — 반대로 `past_due`를 반영하면 정상 결제 중인 구독자가 잠기는 더 나쁜 경우가 생긴다.
