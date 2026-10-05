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
   - Developer tools > Authentication: API 키(→ `PADDLE_API_KEY`), Client-side token(→ 클라이언트 `VITE_PADDLE_CLIENT_TOKEN`).
   - Checkout > Checkout settings: Default payment link = `https://tododo-83576.web.app` (transactionId로 결제창을 열려면 필수).
   - Developer tools > Notifications: 대상 URL `https://tododo-billing-proxy.<subdomain>.workers.dev/webhooks/paddle`, 이벤트 `subscription.created`·`subscription.updated`·`subscription.canceled` → secret key(→ `PADDLE_WEBHOOK_SECRET`).
2. **GCP 결제 전용 서비스 계정**(reminder-proxy 계정과 별도): 역할 `Cloud Datastore User` + `Firebase Authentication Admin` → JSON 키.
3. **시크릿 등록** (`cd billing-proxy`):
   ```bash
   npx wrangler secret put PADDLE_API_KEY
   npx wrangler secret put PADDLE_WEBHOOK_SECRET
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT < ~/billing-service-account.json
   ```
4. 첫 배포는 수동 `npx wrangler deploy`로 확인하고, 이후는 main push 시 CI가 배포한다.

## 로컬·프리뷰 테스트

Paddle 웹훅은 localhost에 닿지 않는다. `npx wrangler versions upload`로 만든 프리뷰 URL을 샌드박스 Notification 대상으로 임시 등록하고, 클라이언트는 `VITE_BILLING_PROXY_URL`을 그 URL로 덮어써 테스트한다. `past_due`·즉시 해지는 Paddle 대시보드의 웹훅 시뮬레이터로 보낸다.

## 실결제 전환

Paddle 운영 계정 승인 → `PADDLE_API_BASE=https://api.paddle.com`, 운영 키·가격 id·웹훅 secret·클라이언트 토큰 교체 → `BILLING_ALLOWED_UIDS="*"` → 클라이언트 `VITE_BILLING_ENABLED=true`.

## 알려진 한계

- 즉시 해지된 사용자가 이미 받은 ID 토큰은 만료(최대 1시간)까지 서버 접근이 가능하다.
- 웹훅이 3일 넘게 실패하면 정상 구독자도 유예가 끝나 잠길 수 있다.
