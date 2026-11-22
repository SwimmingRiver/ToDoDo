# 탈퇴 후 재가입 체험 재지급 방지 + 약관·방침 4판 — 설계

2026-11-22 · 브랜치 `feat/trial-reuse-legal-v4` (origin/develop 13ae321 기준) · develop까지만(main 릴리스는 tododo-ad 세션 담당)

## 왜

7일 무료 체험은 `entitlements/{uid}.trialUsedAt` 하나로만 막는다(`billing-proxy/src/entitlement.ts` `applyTrial`). 회원 탈퇴(`AccountDataStore.deleteUserData`)가 `entitlements`를 지우므로, 같은 구글 계정으로 다시 가입하면 새 uid가 생겨 **웹 카드 없는 체험을 계속 다시 받을 수 있다.**

앱 체험은 스토어가 따로 막는다(Apple은 Apple ID 기준 체험 1회, Google은 Play 체험 offer를 "신규 고객만"으로 두면 Google 계정 기준 1회). 그래서 실제 구멍은 **웹 `/trial`**이고, "앱에서 체험 → 탈퇴 → 웹으로 재가입 → 웹 체험" 경로도 여기에 포함된다.

곧 들어올 Sign in with Apple(spec `2026-10-25-sign-in-with-apple-design.md`, 아직 로컬 브랜치)도 같은 구멍을 가지므로 Apple `sub`도 대상이다. 웹 Apple 로그인 공개는 이 4판 시행일 이후로 정해져 있다(Apple spec 32행).

## 목표 / 비목표 / 안티 목표

목표
1. 4판 시행일 이후 탈퇴한 계정 중 체험을 쓴 계정은, 같은 구글·Apple 계정으로 다시 가입해도 1년 동안 웹 체험이 거절된다(`409 TRIAL_ALREADY_USED`).
2. 약관·개인정보처리방침 4판(2026-12-28 시행)에 보관 항목·Apple 로그인 정보·체험 조항을 반영하고, 30일 전 공지가 자동으로 뜨게 한다.

비목표
- 앱 체험 상품 노출/서버 반영 로직 변경(스토어가 막고, 다른 Apple ID·Google 계정으로 1회 더 받는 건 의도적 허용 — 메모리 trial-reuse 3번).
- Apple 로그인 구현 자체(별도 spec). 여기서는 `apple.com` 식별자를 받을 준비만 한다.
- 이메일 기준 차단(이메일은 바뀔 수 있다). Apple 대리 주소로 새로 가입하면 다른 `sub`라 별도 계정 — Apple spec이 이미 수용한 한계.
- 시행일 전 탈퇴분 소급 차단.

안티 목표
- **보관 때문에 탈퇴가 막히는 것.** 탈퇴는 이용자 권리(App Store 5.1.1(v), 방침 "삭제 요청 시 삭제")라 체험 기록 저장이 실패해도 탈퇴는 끝나야 한다.
- 원래 식별자(구글 `sub`·Apple `sub`)나 uid·이메일이 보관 문서에 남는 것.
- 시행일 전에 동의받지 않은 보관을 시작하는 것.

## 접근

- **A. Firestore `trialHistory` 컬렉션 + billing-proxy (선택)** — 탈퇴 처리에서 삭제 직전에 쓰고, `/trial`에서 읽는다. 기존 `storeLinks`(탈퇴 후에도 남는 영수증↔계정 연결, 서버만 읽고 씀)와 같은 저장소·패턴이라 운영할 곳이 늘지 않는다. 1년 만료는 Firestore TTL 정책 + 읽을 때 만료 무시.
- B. Cloudflare KV(`expirationTtl` 1년) — 자동 만료는 장점이나 새 바인딩·최종 일관성·저장 위치 추가. 제외.
- (검토 후 제외) 체험 시작 시 저장 — 시행 전 체험자를 못 막고, 살아 있는 모든 체험자의 값을 쌓는다. 탈퇴 시 저장이 데이터도 적고 커버리지도 넓다(사용자 결정).

## 확정 사항 (사용자 결정)

| 항목 | 결정 |
|---|---|
| 저장 시점 | **탈퇴할 때**, 그 계정 `trialUsedAt`이 있으면 |
| 식별자 | ID 토큰 `firebase.identities`의 `google.com`·`apple.com` 값. 한 uid에 둘 다 연결돼 있으면 **둘 다** 저장 |
| 저장 형태 | 서버 비밀키 HMAC(원래 값 저장 안 함) |
| 보관 기간 | **탈퇴 후 1년** |
| 4판 시행일 | **2026-12-28** (불리한 변경으로 보고 30일 공지) |
| 방식 | A(Firestore `trialHistory` + billing-proxy) |
| 법률 문구 | 초안 작성 후 **사용자 확인 필수** |

## 설계

### 1. `@tododo/worker-auth` — 로그인 제공자 식별자 노출

`VerifiedToken`에 `identities: Partial<Record<"google.com" | "apple.com", string[]>>`(또는 동등한 형태)를 추가한다. 토큰 페이로드 `firebase.identities`에서 `google.com`·`apple.com` 키만 문자열 배열로 꺼내고, 그 외 키(`email` 등)와 잘못된 형태는 버린다. 없으면 빈 객체. 기존 필드(`uid`·`premium`·`premiumUntil`)와 동작은 그대로 — ai-proxy·calendar-proxy는 무시하면 된다.

### 2. billing-proxy — 인증 결과 전달

`router.ts`의 `authenticate`가 uid만 돌려주는 것을 `VerifiedToken` 전체(또는 `{ uid, identities }`)로 바꾸고, `/account/delete`와 `/trial` 핸들러가 identities를 받게 한다. 다른 라우트 시그니처는 필요한 만큼만 바꾼다.

### 3. 식별자 해시

`trialIdentityKey(secret, provider, sub) = hmacSha256Hex(secret, \`${provider}:${sub}\`)` — 기존 `hmac.ts` 재사용. 제공자 접두사로 구글·Apple 값이 우연히 같아도 섞이지 않는다. 비밀키는 새 Worker 시크릿 **`TRIAL_HMAC_SECRET`**(기존 `BILLING_UID_SECRET`과 용도가 달라 분리). **회전은 하지 않는 것을 전제로 한다**(설계자 판단) — 문서 id가 해시라 키를 바꾸면 기존 기록을 못 찾아 최대 1년 구멍이 다시 열린다. 유출 등으로 꼭 바꿔야 하면 그 손실을 감수한다(버전 접두사·이전 키 병행 조회는 만들지 않음).

### 4. 저장 문서 `trialHistory/{key}`

```
{ provider: "google.com" | "apple.com", recordedAt: <ISO>, expireAt: <Firestore timestamp, recordedAt + 달력 기준 1년(윤일 포함)> }
```

uid·이메일·원래 `sub`는 넣지 않는다. 문서 id가 해시값이라 같은 식별자는 같은 문서 하나다.

기간은 **체험을 쓴 계정을 탈퇴한 때부터 1년**이다(설계자 판단). 재가입한 계정은 `/trial`에서 거절되므로 보통 `trialUsedAt`이 없고, 그 계정을 다시 탈퇴해도 아무것도 쓰지 않는다 — 기간이 늘어나지 않는다. 재가입 계정이 앱 스토어 체험을 써서 `trialUsedAt`이 생긴 경우에만 다시 써서 그때부터 1년이 된다. 방침 문구 "체험을 사용한 계정의 회원 탈퇴 후 1년"과 일치한다.

`firestore.rules`: `match /trialHistory/{key} { allow read, write: if false; }` (서비스 계정만).

TTL: `trialHistory` 컬렉션 그룹의 `expireAt` 필드에 Firestore TTL 정책 — **사용자 1회 설정**(콘솔 또는 `gcloud firestore fields ttls update expireAt --collection-group=trialHistory --enable-ttl`). TTL 삭제는 최대 24시간+ 지연되므로 코드는 읽을 때 `expireAt <= now`면 없는 것으로 본다.

### 5. 탈퇴 처리 (`handlers/deleteAccount.ts`)

순서: (기존) Paddle 해지 → Google 해지 → **[신규] 체험 기록 저장** → `deleteUserData` → `deleteUser`.

체험 기록 저장 조건: `doc.trialUsedAt !== null` **그리고** `now >= 시행 시각(2026-12-28 00:00 서울 = 2026-12-27T15:00:00Z)` **그리고** identities에 google.com/apple.com 값이 하나 이상. 조건을 만족하면 값마다 문서를 쓴다(한 번의 commit 권장).

실패 처리(안티 목표): 저장이 실패하거나 `TRIAL_HMAC_SECRET`이 없으면 `console.error`만 남기고 **탈퇴는 계속한다**(설계자 판단 — 구멍 하나 < 탈퇴 불가). 로그에 식별자·해시는 남기지 않는다(uid만).

멱등: 삭제 전에 쓰므로, 뒤 단계가 실패해 탈퇴를 다시 시도해도 `trialUsedAt`이 아직 남아 있어 다시 쓴다(같은 문서 덮어쓰기).

### 6. 체험 신청 (`/trial`)

`applyTrial` 전에(또는 함께) identities의 각 값으로 키를 만들어 `trialHistory`를 조회한다. 만료 전 문서가 하나라도 있으면 `409 { error: "TRIAL_ALREADY_USED" }`. 웹은 이미 409를 "이미 체험을 사용했어요" 토스트로 처리하므로 **클라이언트 변경 없음**.

시크릿이 없거나 조회가 실패하면: 설계자 판단으로 **체험을 거절하지 않고 기존 로직대로 진행**(fail-open) — 조회 장애로 정상 신규 사용자가 막히는 쪽이 더 나쁘다. `console.error`로 남긴다.

조회는 시행일과 무관하게 항상 한다(시행 전엔 문서가 없을 뿐).

### 7. 약관·방침 4판 (client/src/features/legal)

- `config.ts` `LEGAL_REVISIONS`에 `effectiveOn: "2026-12-28"` 판 추가(판매자 표기는 직전과 같음), `change`에 변경 요약.
- `content/editions/2026-11-27/`로 현재 `privacy.ts`·`terms.ts`(·`refund.ts`) 본문을 옮기고, `content/privacy.ts`·`terms.ts`를 4판 본문으로 고친다. `LEGAL_EDITIONS`에 `{ effectiveOn: "2026-12-28", document: ... }` 추가(본문이 안 바뀌는 refund는 추가하지 않거나 기존 규칙대로).
- 바꿀 내용(문구는 초안 후 사용자 확인):
  - 방침 수집 항목(23행): Google 로그인 줄에 Apple 로그인(이메일 또는 Apple 대리 주소, 첫 가입 시 이름) 추가
  - 방침 수집 방법(38행): Apple로부터 받는 정보 문장 추가
  - 방침 보유 기간 표(49행 부근): "체험 사용 확인값(로그인 계정 식별자를 복원할 수 없게 변환한 값) — 체험을 쓴 계정의 회원 탈퇴 후 1년, 7일 무료 체험 중복 사용 방지"
  - 방침 파기(60행)·탈퇴 안내(92행): "지체 없이 삭제"의 예외로 위 값 언급
  - 방침 처리 위탁/제공 주체: 로그인 제공자로 Apple Inc. 추가
  - 약관 제6조: "계정당 한 번" → 탈퇴 후 같은 Google·Apple 계정으로 다시 가입해도 한 번(탈퇴 후 1년 동안)임을 명시
- 공지는 기존 구조가 처리: 배포되면 시행일 전까지 이전 판 + 변경 예정 공지, 12-28부터 새 판 자동 표시. **공지 30일 확보를 위해 main 배포는 2026-11-28 이전**이어야 한다(tododo-ad 세션에 전달).
- 주의(버그 아님): `resolveLegalRevision`은 가장 가까운 예정 판 하나만 공지한다(`revisions.find(r => r.effectiveOn > today)`). 11-27 전에 배포되면 12-28 공지는 11-27까지 3판 공지 뒤에 가려져 있다가 11-27부터 보인다 — 11-27~12-27로 31일이라 30일 요건은 충족된다.

## 사용자가 할 일 (코드 밖)

1. `TRIAL_HMAC_SECRET` 생성·등록 — 본인 터미널에서 `wrangler secret put TRIAL_HMAC_SECRET`(billing-proxy). **운영에만** 등록한다(설계자 판단): 프리뷰 배포(`versions upload`)도 운영 Firestore(`tododo-83576`)를 쓰므로, 프리뷰에 키가 있으면 테스트 탈퇴가 실제 `trialHistory`를 남긴다. 키가 없으면 저장·조회를 건너뛰고(로그만) 기존 동작대로 간다(5·6절). 로컬 `.dev.vars`로 실검증할 때는 테스트 후 생긴 문서를 지운다.
2. Firestore TTL 정책(`trialHistory.expireAt`) 1회 설정.
3. 4판 문구 확인.
4. (스토어 계정 생긴 뒤) Play Console 체험 offer 자격 "신규 고객만".

## 알려진 한계

- Apple 대리 주소 등으로 **다른 로그인 계정**을 쓰면 새 체험 가능(이메일 기준 차단 안 함 — 의도).
- 시행일(12-28) 전에 탈퇴한 체험 사용자는 막지 않는다.
- 저장 실패 시 그 계정은 막히지 않는다(탈퇴 우선).
- `TRIAL_HMAC_SECRET`을 바꾸면 기존 기록은 무효가 된다(회전 안 함 전제).
- ID 토큰의 identities는 발급 시점 기준 — 탈퇴 직전 연결한 제공자가 토큰 갱신 전이면 빠질 수 있다(앱·웹은 탈퇴 직전 토큰을 새로 받으므로 실질 영향 작음, 구현자가 확인).

## 구현자에게 맡기는 것

- `identities` 타입 모양·파싱 세부, 테스트 픽스처
- trialHistory 읽기/쓰기 저장소 클래스 이름·위치(`storeLinks.ts` 패턴 따름)
- 시행 시각 상수 위치(billing-proxy 쪽 상수, 약관 config와 같은 날짜임을 주석으로)
- 4판 문구 초안(확정은 사용자)
