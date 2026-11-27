# 메타데이터·제출 체크리스트

> **2026-11-26 심사 제출 완료.** 빌드 1.0.0 (4) + 구독 2개(그룹 "ToDoDo 프리미엄")를 한 묶음으로 제출했고, 출시 방식은 **수동**이다(12-28 00:00 KST 이후 직접 "출시"). 아래 체크 표시는 제출 시점 기준이다. 제출 화면에서 알게 된 점은 맨 아래 §9에 있다.
>
> **2026-11-27 재제출.** 1차 제출이 Guideline 2.1 "Information Needed"(정보 요청)로 돌아왔다. 거절이 아니라 자료를 더 달라는 요청이었다. 실기기 화면 녹화를 첨부하고 메모를 2차 제출본으로 바꿔 같은 빌드로 재제출했다. 현재 유효한 메모와 대응 기록은 §10에 있다.

## 1. 출시 시점 — 심사 먼저, 공개는 12-28 이후 (확정 11-23)

- 앱의 Apple 로그인(`mobile/src/screens/LoginScreen.tsx`)은 날짜와 상관없이 보인다. 웹은 12-28 00:00(KST)에 자동으로 공개된다.
- Apple 로그인으로 받는 정보(이메일·대리 이메일·이름)와 체험 사용 확인값은 **4판(12-28 시행)부터** 방침에 들어간다.
- 따라서 심사는 미리 받고, 공개는 **12-28 00:00(KST) 이후**로 한다. 아래 두 방식 중 하나를 고른다.
  - **"이 버전을 수동으로 출시"**: 승인을 받은 뒤 12-28 이후에 직접 출시를 누른다.
  - **"이 날짜 이후 자동으로 출시"(12-28)**: ⚠️ 날짜를 지정할 때 App Store Connect가 보여 주는 시간대를 확인하고, 실제 출시 시각이 **KST 12-28 00:00 이후**가 되게 맞춘다. 예를 들어 화면이 미국 시간대라면, 12-27로 넣었을 때 KST로는 12-28 전에 출시될 수 있다.
- 4판 시행일(12-28)은 이미 공지됐다.
- Google 로그인이 있으므로 Apple 로그인을 빼고 먼저 낼 수는 없다(가이드라인 4.8).

## 2. 가격·판매 국가·구독 상품

- [x] **판매 국가: 대한민국만 (확정 11-23)**. 구독 화면 고지 문구가 "월 4,900원" 고정이다(`premium/PremiumSection.tsx`). 다른 국가에서는 현지 통화 가격과 어긋나 3.1.2 위반 소지가 있다. EU를 열면 DSA 판매자(trader) 정보 공개 절차도 생긴다. 해외 판매를 하게 되면 그 전에 가격 현지화(스토어 가격 표시)를 후속 작업으로 먼저 한다.
- [x] 앱 가격: 무료. 구독 그룹 1개 안에 상품 2개가 있다.
  - `premium_monthly_trial` — 1개월, ₩4,900. 도입 혜택: 7일 무료 체험(신규 가입자)
  - `premium_monthly` — 1개월, ₩4,900
  - ID는 `mobile/src/premium/iap/products.ts`·billing-proxy와 정확히 같아야 한다.
- [x] **첫 버전 제출 때 두 구독 상품을 버전에 함께 첨부**해야 한다. 상품마다 표시 이름, 설명, 심사용 스크린샷(구독 화면) 1장이 필요하다.
  - 표시 이름 예: "ToDoDo 프리미엄(월간)"
  - 설명 예: "AI 플랜·구글 캘린더 연동·통계"
- [x] App Store 서버 알림 URL(billing-proxy)과 Apple 시크릿 3개: 11-26 등록(운영·샌드박스 URL 둘 다, 버전 선택 UI는 없었다). 인앱 구입 키 파일 이름은 `SubscriptionKey_<Key ID>.p8`이다.
- 확정: 월 4,900원 1종. 연간 상품은 먼저 제안하지 않는다.

## 3. 연령 등급 설문

새 설문(13+/16+/18+ 체계)을 기준으로 한 예상 답이다.
- 폭력·성적 콘텐츠·약물·도박·공포·욕설: 모두 **없음**
- 의료·건강 정보: 없음
- 사용자 생성 콘텐츠를 다른 사람과 공유하거나 채팅·메시징하는 기능: **없음**(할 일은 본인만 본다)
- 제한 없는 웹 접근: **없음**. 외부 링크는 약관과 방침을 Safari로 여는 것, 구글 OAuth 창뿐이다.
- 앱 내 구입: **있음**
- AI 기능 문항이 있으면 **있음**으로 답한다. AI 플랜은 목표 문장을 받아 할 일 목록을 만들고, 자유 대화는 하지 않는다. 입력 필터 내용은 `ai-proxy/src/validateInput.ts`에 있다.
- 광고: 없음

→ 계산 결과는 4+였다(11-26 실제 설문). **하지만 약관과 방침 9조는 만 14세 미만 가입을 받지 않는다.** Apple 안내에 따르면 EULA의 최소 연령이 계산된 등급보다 높을 때는 그 연령을 지키는 등급으로 올려야 한다. Apple 등급에는 14+가 없고, 13+로는 13세가 받을 수 있다. 그래서 **16+로 올린다(확정 11-23)**. 16+로 올리면 **대한민국은 15+**로 표시된다(한국 등급은 전체·12·15·19). 약관의 만 14세 기준보다 높으니 맞다. 설문의 "유해 콘텐츠 차단(보호자 통제)", "나이 확인(Age Assurance)", "13세 미만 소셜 미디어 비활성화"는 모두 **아니요**다 — 약관 규칙만 있고 앱이 나이를 확인하지는 않는다.

## 4. 카테고리

- 주 카테고리: **생산성**
- 보조 카테고리: **비즈니스**(추천) 또는 라이프스타일

## 5. URL

| 항목 | 값 | 확인 |
|---|---|---|
| 개인정보처리방침 URL | `https://tododo-app.com/privacy` | 200 응답 확인(11-23) |
| 지원 URL | `https://tododo-app.com/` | 랜딩 푸터에 연락처 이메일과 사업자 정보가 있다(`client/src/layouts/footer/footer.tsx`). 전용 지원 페이지는 없다. 심사에서 문제가 되면 `/support` 페이지 추가를 검토한다 |
| 마케팅 URL(선택) | `https://tododo-app.com/` | |
| 이용약관(EULA) | 표준 Apple EULA 대신 `https://tododo-app.com/terms` 사용 → 앱 정보 > "사용권 계약"에 맞춤 EULA로 입력하거나 설명 끝 링크로 대신한다([listing-ko.md](listing-ko.md)) | 앱 구독 화면에도 약관·방침 버튼이 있다(`PremiumSection.tsx`) |

## 6. 앱 심사 정보 — 메모(영어, 심사관용, 11-26 1차 제출본)

> 11-27 2.1 정보 요청을 받고 **§10의 2차 제출본으로 교체**했다. 아래는 1차 기록으로 남겨 둔다. 로그인 정보 설명은 지금도 유효하다.

**로그인 정보**: 데모 계정은 **Google 데모 계정 + 운영자 부여 프리미엄**을 추천한다. 이유는 다음과 같다.
- 심사관은 자기 Apple ID로 Apple 로그인을 할 수 있다. 하지만 그렇게 하면 프리미엄 기능을 보려면 샌드박스에서 구독해야 한다.
- 데모 Google 계정은 낯선 기기에서 로그인하면 추가 인증이 걸릴 수 있다. 그러니 2단계 인증을 끄고, 복구 수단을 사용자 연락처로 둔 전용 계정을 만든다.
- 이 계정은 [demo-data.md](demo-data.md)의 데모 계정과 같이 쓴다.

```
Sign-in
- The app requires an account. Use the demo Google account in the Sign-In Information fields
  ("Google로 로그인"); it already has Premium enabled and sample to-dos.
  You can also create an account instantly with "Sign in with Apple" using your own Apple ID.

Premium (auto-renewable subscription)
- Tabs: 오늘 (Today) / 목록 (List) / 캘린더 (Calendar) / 통계 (Insights). The account screen (계정) opens from the
  person icon in the header on any tab; the Premium section is there. Two products in one group:
  premium_monthly_trial (7-day free trial for new subscribers) and premium_monthly (shown to accounts that
  already used a trial). Both are ₩4,900/month.
- Premium unlocks: AI Plan (목록 tab > "AI로 계획" button, goal → step-by-step to-dos with due dates),
  Google Calendar integration (캘린더 tab), and Statistics (통계 tab). Free users see a locked notice with
  the subscribe button.
- "Restore Purchases" (구매 복원) is on the same screen.

Account deletion (5.1.1(v))
- Account screen (계정) > "회원 탈퇴" (Delete account). For Sign in with Apple users, the app revokes the
  Apple token during deletion. Please do not delete the demo Google account.

Other
- All UI is Korean. Deadline reminders are push notifications sent by our server through Firebase Cloud
  Messaging (APNs), only after the user allows notifications. They arrive even when the app is closed.
- AI Plan sends only the goal text and dates to our server, which calls Anthropic's API; no tracking or ads.
```
- [x] 연락처(이름·전화·이메일)는 사용자가 입력한다.
- [x] 탭 이름과 버튼 문구는 실제 production 빌드에서 다시 맞춘다(위 영어 설명과 일치하는지).

## 7. 수출 규정(암호화)

- `app.json`에 `ITSAppUsesNonExemptEncryption: false`가 들어 있다(확인함). HTTPS와 OS가 제공하는 암호화만 쓰므로 면제 대상이다. 업로드 후 수출 규정 질문이 뜨지 않아야 정상이다.

## 8. 그 외

- [x] Sentry `tododo-mobile` 프로젝트의 Settings → Security & Privacy → "Prevent Storing of IP Addresses" 켜짐 — 사용자가 11-22에 확인. App Privacy 라벨에 "대략적 위치"는 추가하지 않는다([app-privacy.md](app-privacy.md)).

- [x] 저작권: `2026 TODODO`(방침·약관의 판매자 표기와 같게)
- [x] 콘텐츠 권한(제3자 콘텐츠): 없음
- [x] 버전 `1.0.0`(app.json). 빌드 번호는 EAS가 자동으로 올린다(`docs/mobile-release.md`)
- [x] 앱 아이콘: 1024 마케팅 아이콘은 빌드에 포함된다(#173 도도새)
- [x] App Privacy 답변: [app-privacy.md](app-privacy.md)
- [x] 스크린샷: **중형 Dynamic Island iPhone(1206×2622)** 6장 — 6.9형이 아니다. §9와 [demo-data.md](demo-data.md)
- [x] Sign in with Apple 대리 이메일 릴레이: 앱이 사용자에게 메일을 보내지 않으므로 도메인 등록은 필요 없다
- [x] 심사 전 production 빌드를 TestFlight에서 확인할 것: 스플래시, 구독 화면 고지 문구, 탈퇴, Apple 로그인 한국어 버튼

## 9. 제출 화면에서 알게 된 점 (11-26)

- **스크린샷 칸이 기기 종류별이다.** "15.5cm 또는 15.9cm 디스플레이의 iPhone(중형, Dynamic Island)", iPhone Duo, iPad, Watch로 나뉜다. 중형 칸은 **1179×2556 또는 1206×2622**만 받는다. iPhone 18 Pro Max 시뮬레이터 원본(1320×2868)은 "크기가 유효하지 않음"으로 거절됐다 → `sips`로 1206×2622로 줄이고(가로 1px 크롭), 알파 채널 없는 JPEG로 저장해 올렸다. 다음에는 **iPhone 18 Pro 시뮬레이터(1206×2622)**로 바로 찍는다.
- **첫 구독은 버전 페이지에서 고르지 않는다.** 앱 버전 1.0을 먼저 "심사에 추가"한 뒤, 각 구독 상품 페이지 오른쪽 위 **"심사에 추가"**로 같은 제출 묶음에 넣는다. 구독 그룹은 상품과 함께 자동으로 들어간다.
- 구독 상품 상태는 정보를 다 채워도 "제출 준비 중"으로 보였다. 저장 버튼이 회색이면 바뀐 내용이 없다는 뜻이다.
- **앱 가격이 실수로 ₩4,900(유료)로 들어가 있었다** → 가격 변경 일정에서 기준 국가 대한민국을 ₩0으로 바꿨다. 다른 국가 행에는 $2.99 등 예전 가격이 남아 있다. 지금은 판매 국가가 대한민국뿐이라 영향이 없지만, **해외 판매를 열 때 반드시 정리한다.**
- 구독 상품의 **구입 옵션 → 멀티시트 구입**이 기본으로 "허용됨"이다. 서버는 구매 하나를 계정 하나에 연결하므로 끄는 것을 추천했다(제출 시 반영 여부는 사용자 확인 필요).
- 앱 개인정보 보호의 "사용자 개인정보 선택 URL"은 선택 항목이라 비웠다.
- 콘텐츠 권한(제3자 콘텐츠)은 **아니요** — 구글 캘린더 일정은 사용자 본인 데이터, AI 플랜 결과는 그 사용자 전용 생성물이다.
- 앱 심사 정보: 로그인 필요, 데모 계정 `tododo.demo@gmail.com`(비밀번호는 저장소에 적지 않는다). 메모에는 "Please do not delete the demo Google account."를 덧붙였다.

## 10. 2차 제출 — Guideline 2.1 정보 요청 대응 (11-27)

### Apple이 요청한 것

Apple은 "App Review Information의 Notes 칸에 아래를 모두 넣고 재제출하라"고 요청했다. **설명(공개)이 아니라 앱 심사 정보 → 메모(심사관만 봄)**에 넣는다.

1. 실기기·최신 OS 화면 녹화. 앱 실행부터 시작하고, 가입·로그인·탈퇴, 사용자 생성 콘텐츠의 신고·차단(있으면), 유료 기능 접근을 포함한다.
2. 앱의 목적과 대상 사용자
3. 주요 기능 접근 방법과 로그인 정보
4. 외부 서비스 목록(인증·결제·AI 등)
5. 지역별 차이
6. 규제 산업이나 제3자 보호 자료 관련 서류

### 화면 녹화

- **첨부 위치**: 앱 심사 정보 → 메모 아래 **첨부 파일**. 칸은 선택사항이지만 이번 요청에서는 필수다.
- **찍은 순서**: 앱 아이콘 탭 → 스플래시 → **새 Apple 계정**으로 가입(이메일 가리기) → 할 일 추가·완료 → 잠금 안내 → 프리미엄 구독 → 프리미엄 기능 → 의견 보내기 → 구매 복원 → 탈퇴 시 Apple 구독 경고 → 탈퇴 → 로그인 화면.
- **탈퇴는 새로 만든 계정으로만** 한다. 데모 계정(`tododo.demo@gmail.com`)을 지우면 심사관이 로그인하지 못한다.
- **신고·차단은 해당 없음**: 할 일은 본인만 보고 사용자끼리 공유하는 기능이 없다. 의견 보내기는 개발자에게만 간다.
- **샌드박스 구독 함정**: 프리미엄은 ToDoDo 계정(uid) 기준이라, 새 계정에서는 Apple ID에 구독이 살아 있어도 잠금 화면이 보인다. 하지만 같은 Apple ID에 구독이 살아 있으면 새 결제창이 뜨지 않는다. 이전 실측 구독은 해지한 뒤 만료되고 나서 찍는다(TestFlight는 갱신 주기가 짧다). 탈퇴한 계정의 `storeLinks`는 서버가 지우므로(`billing-proxy/src/accountDataStore.ts`) 새 계정이 "다른 계정에서 사용 중"에 걸리지는 않는다.
- **Apple 구독은 탈퇴해도 해지되지 않는다**: 개발자 서버가 해지할 방법이 없다. 앱은 탈퇴 때 경고와 "구독 관리" 버튼을 보여준다(`mobile/src/screens/AccountScreen.tsx`).
- **파일 형식 함정**: iPhone 화면 녹화는 확장자가 `.MP4`여도 코덱이 **HEVC**다. 업로드가 안 돼서 macOS 내장 `avconvert`로 H.264로 바꿨다(원본 2분 37초, 41MB → 49MB). Apple 문서에는 심사 첨부의 허용 형식이 따로 없다. 앱 미리보기 규격이 H.264이고 포럼에 대문자 확장자 사례가 있어 이렇게 판단했다.
  ```bash
  avconvert --source "<원본>.MP4" --preset PresetHighestQuality --output review-h264.mp4
  ```
  그래도 안 올라가면 YouTube 일부 공개 링크를 메모 1번에 넣는다.

### 메모 (2차 제출본)

```
1. Screen recording
- Attached in App Review Information (recorded on a physical iPhone, latest iOS). It shows: app launch,
  account creation with Sign in with Apple, core to-do features, subscribing to Premium (sandbox) and
  using Premium features, Restore Purchases, and account deletion.

2. Purpose and target audience
- ToDoDo is a personal to-do planner for students and working adults in Korea who struggle to turn
  a big goal into concrete daily tasks. Users manage to-dos with due dates, priorities, subtasks and
  repeats, see them by day/list/calendar, and get deadline reminders. Premium adds an AI planner that
  breaks a goal into step-by-step to-dos with dates, Google Calendar overlay, and statistics.

3. How to access the main features
- Sign in with the demo Google account in the Sign-In Information fields ("Google로 로그인").
  It has Premium enabled and sample to-dos. Please do not delete this account.
  You can also create a new account instantly with "Sign in with Apple".
- Tabs: 오늘 (Today) / 목록 (List) / 캘린더 (Calendar) / 통계 (Insights). The account screen (계정)
  opens from the person icon in the header.
- Premium: Account screen > Premium. Two auto-renewable products in one group: premium_monthly_trial
  (7-day free trial for new subscribers) and premium_monthly (for accounts that already used a trial),
  both ₩4,900/month. "Restore Purchases" (구매 복원) is on the same screen. Free users see a locked
  notice with a subscribe button.
- AI Plan: 목록 tab > "AI로 계획" > enter a goal (e.g. "다음 달까지 토익 800점") > preview > save.
- Account deletion: Account screen > "회원 탈퇴". For Sign in with Apple users, the Apple token is
  revoked during deletion.
- Feedback: "의견 보내기" sends a message privately to the developer. There is no content shared
  between users (no public posts, comments, or profiles), so reporting/blocking does not apply.

4. External services
- Firebase (Google): Authentication, Cloud Firestore (user data), Cloud Messaging (push via APNs)
- Sign in with Apple, Google Sign-In (authentication)
- Apple In-App Purchase / App Store Server API (subscriptions)
- Anthropic Claude API (AI Plan; only the goal text and dates are sent, via our server)
- Google Calendar API (read-only overlay, only if the user connects it)
- Cloudflare Workers (our server endpoints for AI, billing, calendar, reminders, feedback)
- Sentry (crash/error reporting; IP address storage disabled)
- No ads, no tracking.

5. Regional differences
- The app is distributed in South Korea only and the UI is Korean. Features and content are the
  same for all users; there are no region-specific features.

6. Regulated industry / third-party material
- Not applicable. The app is not in a regulated industry and contains no protected third-party
  content. Google Calendar events shown are the user's own data.
```

외부 서비스 목록은 `mobile/package.json` 의존성과 Worker 5개(ai·billing·calendar·feedback·reminder-proxy)를 대조해 적었다. 의견 알림용 Discord(내용 없는 알림)는 핵심 기능이 아니라서 넣지 않았다.

### 재제출 절차

1. 메모·첨부를 저장한다(저장 버튼이 회색이 될 때까지).
2. **앱 심사** 페이지에서 해당 제출 건을 열고 재제출 버튼을 누른다. 저장만 해서는 재심사에 들어가지 않는다.
3. 제출 묶음에 구독 상품 2개가 남아 있는지 확인한다. 빠졌으면 각 상품 페이지에서 "심사에 추가"를 다시 누른다.
4. 출시 방식이 **수동**으로 남아 있는지 확인한다.
5. (선택) 심사 메시지 스레드에 "메모와 녹화를 추가했다"고 짧게 답장한다.
