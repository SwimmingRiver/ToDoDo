# billing-proxy

프리미엄 결제/구독(Paddle Billing) Worker. 스펙: `docs/superpowers/specs/2026-10-04-premium-billing-paddle-design.md`

| 경로 | 인증 | 설명 |
|---|---|---|
| `POST /checkout` | Firebase ID 토큰 | 서버가 Paddle 거래 생성 → `{ transactionId }` |
| `POST /trial` | Firebase ID 토큰 | 카드 없는 7일 체험(계정당 1회) |
| `POST /portal` | Firebase ID 토큰 | Paddle 고객 포털 URL |
| `POST /webhooks/paddle` | `Paddle-Signature` | `subscription.created/updated/canceled` 반영 |

## 배포 준비 (사용자 작업 — 비밀값은 본인 터미널에서)

1. **Paddle 샌드박스**(sandbox-vendors.paddle.com)
   - Catalog: 상품 "ToDoDo 프리미엄" + 월간 KRW 가격 **₩4,900, 세금 포함(tax inclusive)** — 클라이언트 표시 가격 `PREMIUM_MONTHLY_PRICE_LABEL`과 같아야 한다 → `pri_…`를 `wrangler.toml`의 `PADDLE_PRICE_ID`에.
   - 설정 > Authentication(`/settings/authentication`): API 키(→ `PADDLE_API_KEY`, 권한은 Transactions·Customer portal sessions Write만), Client-side token(→ 클라이언트 `VITE_PADDLE_CLIENT_TOKEN`, `test_`로 시작). **API 키는 만료일이 있다**(현재 샌드박스 키 2027-01-06 만료) — 만료 전에 새 키를 만들어 `wrangler secret put PADDLE_API_KEY`로 교체하지 않으면 `/checkout`·`/portal`이 그날부터 실패한다.
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

### 릴리스(develop→main) 전제

- `PADDLE_PRICE_ID` placeholder 교체 완료 + 샌드박스 실측(Task 11) 완료 **후에만** 릴리스 PR을 연다. main CI의 `billing-proxy` job은 placeholder면 실패하는데, `deploy` job(rules·클라이언트)은 이 job을 기다리지 않아 rules·클라이언트만 먼저 나가 버린다.
- 릴리스 직후 운영자 계정에 `npm run grant:entitlement`(루트)를 다시 실행한다.

## 로컬·프리뷰 테스트

Paddle 없이 로컬에서: `.dev.vars`에 결제용 서비스 계정 JSON(`GOOGLE_SERVICE_ACCOUNT='{"type":...}'` — 작은따옴표로 원문 그대로, 큰따옴표로 감싸면 wrangler가 `\"`를 풀지 않아 파싱 실패), 아무 값의 `PADDLE_WEBHOOK_SECRET`·`BILLING_UID_SECRET`, 테스트 계정 uid의 `BILLING_ALLOWED_UIDS`를 넣고 `npx wrangler dev`(값을 바꾸면 재시작). 그 뒤 `node scripts/sendTestWebhook.mjs <uid> <active|cancel-scheduled|past-due|canceled|forged-sig|trialing> [--sub id]`로 서명된 가짜 웹훅을 보내 클레임·문서 반영과 클라이언트 실시간 갱신을 확인한다. 클라이언트는 `VITE_BILLING_ENABLED=true VITE_BILLING_PROXY_URL=http://localhost:8787 npm run dev`. 로컬도 **운영 Firestore·Auth에 쓴다** — 반드시 테스트 계정으로. 가짜 웹훅은 `customerId: "ctm_local_test"`를 남기므로, 같은 계정으로 샌드박스 결제를 하기 전에 그 계정 `entitlements` 문서의 `customerId`·`subscriptionId`를 비운다(남아 있으면 `/checkout`이 Paddle `400 bad_request`).

Paddle 웹훅은 localhost에 닿지 않는다. `npx wrangler versions upload`로 만든 프리뷰 URL을 샌드박스 Notification 대상으로 임시 등록하고, 클라이언트는 `VITE_BILLING_PROXY_URL`을 그 URL로 덮어써 테스트한다. `past_due`·즉시 해지는 Paddle 대시보드의 웹훅 시뮬레이터로 보낸다.

샌드박스 결제 테스트는 운영자 계정(2099년까지 수동 부여)이 아니라 **별도 테스트 계정**으로 한다(허용 목록에 그 uid를 임시로 추가). 운영자 계정으로 결제하면 수동 부여가 구독 기간으로 덮어써진다 — 이미 했다면 `npm run grant:entitlement`(루트)를 다시 실행한다. 테스트가 끝나면 **그 테스트 구독을 먼저 해지하고 나서** 허용 목록에서 uid를 뺀다 — 웹훅도 허용 목록을 확인하므로, 순서를 바꾸면 해지 웹훅이 버려져 테스트 계정이 마지막 `premiumUntil`(+3일)까지 프리미엄으로 남는다.

## 실결제 전환

Paddle 운영 계정 승인 → `PADDLE_API_BASE=https://api.paddle.com`, 운영 키·가격 id·웹훅 secret·클라이언트 토큰 교체 → `BILLING_ALLOWED_UIDS="*"` → 클라이언트 `VITE_BILLING_ENABLED=true` → `.github/workflows/ci.yml` deploy job의 `VITE_PADDLE_ENV: sandbox`를 `production`으로.

전환 전에 코드로 보강할 것(샌드박스에서는 허용 목록이 막아 주지만 `*`로 열면 드러나는 빈틈):
- 웹훅이 구독 항목의 `price_id`가 `PADDLE_PRICE_ID`인지 확인한다. 지금은 확인하지 않아, 카탈로그에 더 싼 가격이 생기면 Paddle.js로 직접 연 결제(자기 uid_sig 재사용)로 그 가격에 프리미엄을 얻을 수 있다.
- 다른 구독의 `past_due` 이벤트는 지금 그대로 반영되어 추적 중인 `subscriptionId`가 바뀐다. 이후 그 구독의 해지가 살아 있는 구독의 권한을 회수할 수 있으므로 `isForeignCancel`처럼 다룰지 정한다.

## 알려진 한계

- 즉시 해지된 사용자가 이미 받은 ID 토큰은 만료(최대 1시간)까지 서버 접근이 가능하다.
- 웹훅이 3일 넘게 실패하면 정상 구독자도 유예가 끝나 잠길 수 있다.
- 이중 구독(두 결제가 모두 성립)이면 문서는 한 구독만 추적한다. 추적 중인 구독이 유효한 동안 다른 구독의 해지·일시정지 이벤트는 무시하고 경고 로그(`이중 구독 의심`)만 남긴다 — 이중 결제 자체는 Paddle 대시보드에서 환불 처리한다.
