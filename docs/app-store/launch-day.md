# 출시일(12-28) 체크리스트

iOS 앱 첫 공개일과 약관·방침 4판 시행일이 같은 날(2026-12-28)이다. 그날 할 일과 확인할 일이 메모리·문서 여러 곳에 흩어져 있어 한 장으로 모았다. 순서대로 내려가면 된다.

- **누가**: App Store Connect 조작과 실기기 확인은 사용자, 웹 페이지·로그 확인은 Claude 세션이 도울 수 있다.
- **전제**: 1.0.0 (4)가 심사를 통과해 상태가 **"개발자 출시 대기"(Pending Developer Release)** 다. 아직 심사 중이거나 정보 요청 상태면 이 문서는 승인 뒤로 미룬다.

## 0. 전날(12-27)까지

- [ ] App Store Connect 상태가 "개발자 출시 대기"인지 확인한다.
- [ ] 출시 방식이 **수동**으로 남아 있는지 확인한다(`checklist.md` §1). 날짜 지정 자동 출시로 바꿨다면 시간대를 다시 본다.
- [ ] 판매 국가가 **대한민국만**인지 확인한다. 다른 국가에 남은 $2.99 가격은 판매하지 않으므로 그대로 둬도 된다(`checklist.md` §2).
- [ ] 데모 계정(`tododo.demo@gmail.com`)을 지우거나 프리미엄을 풀지 않았는지 확인한다. 출시 후 업데이트 심사에서도 계속 쓴다.

## 1. 00:00 KST 자동 전환 — 배포 없이 바뀌는 것

아래 세 가지는 코드에 날짜가 박혀 있어 **배포하지 않아도** 서울 시각 12-28 00:00에 바뀐다. 열려 있던 탭은 새로고침해야 보인다.

| 바뀌는 것 | 코드 위치 | 확인 방법 |
|---|---|---|
| 약관·방침 4판 시행 | `client/src/features/legal/config.ts`, `content/index.ts` | `/terms`·`/privacy`의 시행일이 2026년 12월 28일이고, 변경 이력에 12-28 줄이 생기고, "4판 변경 예정" 안내가 사라졌는지 본다. `/refund`도 함께 본다. |
| 웹 Apple 로그인 버튼 공개 | `client/src/features/auth/config.ts` `APPLE_LOGIN_OPENS_AT` | 운영 로그인 페이지에 Apple 버튼이 보이는지 본다. **Safari**에서 첫 클릭에 팝업이 열리는지도 본다(11-23에 Safari 첫 팝업 차단을 고친 적 있다). |
| 탈퇴 시 체험 사용 기록 시작 | `billing-proxy/src/trialHistory.ts` `TRIAL_HISTORY_START` | 바로 확인할 것은 없다. 12-28 이후 첫 탈퇴가 생기면 `trialHistory` 컬렉션에 문서가 생기는지 본다. 첫 만료는 2027-12-28이고, 그 전에 삭제 작업을 만들어야 한다. |

- [ ] 약관·방침·환불 페이지 4판 확인
- [ ] 웹 로그인 페이지 Apple 버튼 확인(Chrome, Safari)

## 2. 앱 출시

- [ ] **00:00 KST가 지난 뒤** App Store Connect에서 1.0.0을 열고 "이 버전 출시"를 누른다.
- [ ] 상태가 "판매 준비됨"(Ready for Distribution)으로 바뀌는지 본다. App Store 검색에 뜨기까지는 몇 시간에서 하루가 걸릴 수 있다.
- [ ] App Store에서 설치해서 스모크 확인을 한다. TestFlight 빌드는 먼저 지우고 깐다.
  - Google 로그인, Apple 로그인
  - 할 일 추가·완료, 오늘·캘린더·통계 탭
  - 프리미엄 화면에 월 4,900원과 7일 체험 문구가 보이는지

## 3. 첫 운영 결제 확인

지금까지 앱 결제는 TestFlight **샌드박스**로만 확인했다. 운영 결제는 Apple 운영 API(`api.storekit.itunes.apple.com`)를 타므로 출시 후 첫 결제에서 따로 확인해야 한다(`billing-proxy/src/apple/serverApi.ts`).

- [ ] 실제 계정으로 체험을 시작하거나(무료) 첫 실사용자 결제를 기다린다.
- [ ] Firestore `entitlements/{uid}`의 `sources.apple`을 본다.
  - `environment`가 `"Production"`
  - `premiumUntil`이 체험 끝 + 3일 유예
  - 앱을 다시 열지 않아도 `lastNotificationUUID`가 채워지면 App Store 서버 알림(운영 URL)까지 확인된 것이다.
- [ ] 값이 이상하면 `cd billing-proxy && npx wrangler tail tododo-billing-proxy`를 켜고 다시 시도한다. Sentry에서 billing-proxy 401·500도 본다.
- [ ] 직접 체험을 시작했다면 확인 뒤 **기기의 설정 → Apple 계정 → 구독**에서 해지해 실결제를 막는다.

## 4. 그대로 둘 것

- **`APPLE_CONSUMPTION_REPLY_ENABLED = "false"`**(`billing-proxy/wrangler.toml`): Apple 환불 요청에 우리 정보를 회신하는 기능이다. 방침에 Apple 정보 제공 고지·동의를 넣은 다음 판에서 켠다. 꺼져 있으면 Apple이 혼자 환불을 판단할 뿐 출시를 막지는 않는다.
- **판매 국가 대한민국만**: 구독 고지 문구가 "월 4,900원" 고정이라 해외 판매는 가격 현지화 뒤에 연다.
- **다음 앱 수정은 1.0.1로**: 1.0.0이 공개된 뒤 새 버전으로 만든다. `app.json`의 `version`은 직접 올리고, 빌드 번호는 EAS가 올린다(`docs/mobile-release.md`).

## 5. 첫 주에 볼 것

- [ ] Sentry `tododo-mobile`: 운영 첫 이벤트의 스택이 `src/` 경로로 보이는지(소스맵), 시작 중 종료(WatchdogTermination)가 반복되는지
- [ ] 운영 의견함(`/admin/feedback`)과 Discord 알림
- [ ] App Store Connect의 평가·리뷰, 환불 알림(`REFUND`)이 billing-proxy에 들어와 프리미엄이 회수되는지
- [ ] 마감 알림 푸시가 운영 사용자에게 오는지(reminder-proxy 로그)
