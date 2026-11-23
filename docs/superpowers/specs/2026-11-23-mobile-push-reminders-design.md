# 앱(iOS) 서버 푸시 마감 알림 설계

작성: 2026-11-23 · 브랜치 `feat/mobile-push-reminders` (origin/develop aecb80f 기준)
관련 스펙: `2026-09-27-deadline-reminders-design.md`(웹 마감 알림), `2026-10-01-reminder-history-design.md`(알림 기록)

## 1. 왜 하는가

- App Store 첫 출시 전 "권장" 항목 중 사용자가 가장 크게 체감하는 기능이다(11-23 우선순위 정리: App Store 먼저, Play는 나중).
- 지금 앱 알림은 기기 안에서 예약하는 로컬 알림이다. 그래서 웹이나 다른 기기에서 할 일·마감을 바꾸면 이 기기 알림은 그대로 남고, 앱을 열지 않으면 다시 예약되지도 않는다.
- 로컬 알림 구현에는 버그도 있다(아래 §3). 서버 푸시로 바꾸면서 같이 정리한다.

성공 기준: 웹이든 앱이든 어디서 할 일을 바꿔도, 앱을 열지 않은 iPhone에 웹과 같은 규칙(기본값 + 할 일별 재지정)으로 알림이 한 번씩 온다. 앱 안에서 기본값과 할 일별 알림 시점을 정하고, 알림 기록을 볼 수 있다(사용자 확정: "웹과 동일하게 기본값과 설정 알림, 알림 기록이 다 있어야 해").

## 2. 목표 / 비목표 / 실패 기준

**목표**
- iPhone 앱이 FCM 토큰을 reminder-proxy에 등록해서, 웹과 같은 서버 예약(DO 알람)으로 푸시를 받는다.
- 앱에서 쓰는 화면 세 가지:
  1. 사용자 기본 알림 시점(없음/정각/10/30/60분/하루 전, 기본 30분) 설정
  2. 할 일 폼의 할 일별 알림 시점 재지정(기본값 따름/없음/정각/…)
  3. 알림 기록 보기와 읽음 처리
- 알림을 탭하면 해당 할 일 상세로 이동한다.
- 로그아웃하면 이 기기 토큰을 해제한다. 오프라인이면 해제 대기를 표시하고 다음 동기화 때 지운다.
- 기존 로컬 알림 예약 코드는 제거한다.

**비목표(이번에 안 함)**
- Android 빌드·실기 검증, Play 스토어. 단 구조는 막지 않는다(플랫폼 값을 `Platform.OS`로 보내는 등).
- iPad(iPhone 전용으로 확정).
- 알림 안의 액션 버튼(예: "완료"), 리치 알림, 지난 마감 알림.
- 서버가 안 될 때 로컬 알림으로 대신 보내는 것.

**실패 기준(돌아가더라도 실패로 본다)**
- 같은 할 일 알림이 한 기기에 두 번 온다(로컬 + 푸시, 또는 재시도 중복).
- 완료·삭제·보관된 할 일이나 마감이 바뀐 할 일의 옛 알림이 온다.
- 로그아웃한 기기에서 앞 계정의 알림이 계속 온다.
- 웹 사용자의 알림이 이 변경 때문에 끊기거나 달라진다.

## 3. 현재 상태 (조사 결과)

- `mobile/src/notifications/scheduleReminder.ts`: 마감 정각에 "마감 시간입니다"로 로컬 알림을 건다. 사용자 설정은 무시한다. `useUpdateTodo.ts`는 마감을 수정할 때 옛 예약을 취소하지 않고 새 예약을 하나 더 건다. 완료·삭제 시에도 취소하지 않는다. 로그아웃 시에만 `cancelAllScheduledNotificationsAsync`를 부른다(`auth/signOut.ts`).
- 앱은 Firebase JS SDK만 쓴다. 그래서 FCM 토큰을 받을 수단이 없다. `expo-notifications`는 이미 설치돼 있고 config plugin도 등록돼 있다. `GoogleService-Info.plist`도 이미 있다.
- reminder-proxy(`reminder-proxy/src`):
  - `router.ts`는 `PLATFORMS = {"web"}`만 허용한다.
  - `fcm.ts`는 `notification` + `data.todoId` + `webpush` 블록만 보내고, APNs 블록은 없다.
  - 그 밖의 부분(예약 재계산, 중복 방지, 무효 토큰 삭제, 기록·읽음 API, `/account` 삭제)은 플랫폼과 무관하다.
- 앱 탈퇴(`account/deleteAccount.ts`)는 이미 reminder-proxy의 `DELETE /account`를 부른다. Worker 인증은 Origin과 무관하다(Firebase ID 토큰만 본다). 그래서 앱이 Origin 헤더 없이 호출해도 된다.
- 공용 규칙: `packages/core/src/reminders`(`REMINDER_OFFSETS`, `resolveReminderOffset`, `reminderSettingLabel` 등). 할 일 필드는 `reminderOffsetMinutes`(core `types/todo.ts`)다. 사용자 기본값은 `userSettings/{uid}.reminderDefaultOffsetMinutes`이고, firestore.rules가 이미 본인 쓰기를 허용한다.
- 웹 클라(`client/src/features/reminders`)의 구성:
  - `usePushTokenSync`(진입 시 토큰 재등록)
  - `useReminderRefresh`(todos 캐시 지문 → 2초 디바운스 → `POST /reminders/refresh`)
  - `useForegroundReminders`(앱이 열려 있을 때 토스트를 띄우고 3초 뒤 기록 재조회)
  - `useNotificationClickNavigation`
  - `ReminderPromptProvider`(마감 있는 할 일을 저장한 직후 권한을 묻는 앱 안 안내)
  - `notificationMenu`(벨, 미읽음 배지, 기본값 선택, 기록 목록)

## 4. 접근 방식 (검토안)

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **A. `@react-native-firebase/messaging` 추가 (채택)** | 앱이 FCM 토큰을 받는다. Worker는 기존 FCM v1 경로로 보낸다. | 발송 경로가 하나다. "한 기기라도 받으면 재시도 안 함"과 무효 토큰 즉시 삭제가 지금처럼 동기 판정된다. Android가 거의 그대로 붙는다. | 네이티브 모듈이 추가돼 dev 빌드를 다시 해야 한다. Firebase 콘솔에 APNs 키를 올려야 한다. iOS에서 static frameworks 설정이 필요할 수 있다. |
| B. Expo Push Service | `getExpoPushTokenAsync`로 받은 토큰을 Worker가 exp.host로 보낸다. | 앱 쪽 추가가 거의 없고 재빌드가 필요 없을 수 있다. | 발송 경로가 두 개가 된다. 전달 여부와 무효 토큰을 receipt로 나중에 조회해야 해서 기존 중복 방지·토큰 정리 로직을 다시 설계해야 한다. 외부 서비스 의존이 늘어난다. |
| C. Worker → APNs 직접 | 생 APNs 토큰으로 Worker가 Apple에 직접 보낸다. | 추가 SDK가 없다. | APNs는 HTTP/2만 받는데 Cloudflare Worker의 외부 fetch는 HTTP/2로 나가지 않아 실제로 안 될 가능성이 크다. 제외했다. |

사용자가 11-23에 A를 선택했다.

## 5. 설계

### 5.1 네이티브 구성 (앱)
- `@react-native-firebase/app`, `@react-native-firebase/messaging`를 추가하고 config plugin을 등록한다. Firebase 설정은 기존 `GoogleService-Info.plist`를 쓴다.
- RNFirebase가 요구하는 iOS 설정(`expo-build-properties`의 `ios.useFrameworks: "static"` 등)을 넣는다. 이 설정이 기존 네이티브 모듈과 충돌하는지는 **계획 첫 태스크에서 빌드로 확인**한다. 충돌하면 우회책을 찾고, 그래도 막히면 사용자에게 돌아간다. 기존 모듈은 Sentry, Google Sign-In, Apple 로그인, expo-iap, datetimepicker다.
- 데이터(Firestore·Auth)는 계속 JS SDK를 쓴다. RNFirebase는 messaging 용도로만 쓴다.
- Push Notifications capability와 `aps-environment` entitlement가 빌드에 들어갔는지 확인한다(expo-notifications plugin이 넣는다).

### 5.2 Worker 변경 (reminder-proxy)
- `router.ts`: `PLATFORMS`에 `"ios"`를 추가한다. `"android"`는 Android 작업 때 추가한다.
- `fcm.ts`: 메시지에 `apns` 블록을 추가한다.
  - `headers`: `apns-expiration`(지금 + ttlSeconds, 초 단위 epoch)과 `apns-priority: "10"`. 웹의 TTL과 같은 의미다. 마감 + 유예가 지난 알림이 몰려오지 않게 한다.
  - `payload.aps.sound: "default"`.
  - 플랫폼별로 분기하지 않고 `webpush`와 `apns` 블록을 모든 메시지에 함께 넣는다. FCM은 해당 플랫폼 블록만 쓰고 나머지는 무시한다. **(내 판단)** 메시지 하나로 단순하게 유지하려는 것이다.
- 그 밖의 부분(예약, 중복 방지, 기록, 무효 토큰 삭제)은 건드리지 않는다. 웹 동작이 바뀌지 않는지는 기존 테스트 통과로 확인한다.
- 배포 순서: Worker를 먼저 배포한다. 하위 호환이라 웹에는 영향이 없다. 앱 빌드는 그 뒤다.

### 5.3 앱 클라이언트 모듈 (`mobile/src/reminders/`, 새로 만듦)

웹 `features/reminders`와 같은 역할로 나눈다.
- `reminderProxyApi`: 토큰 등록·삭제, refresh, history, seen. 주소는 기존 `EXPO_PUBLIC_REMINDER_PROXY_URL`을 쓰고, 인증은 Firebase ID 토큰 Bearer다.
- `reminderSettingsApi` / 훅: `userSettings/{uid}.reminderDefaultOffsetMinutes` 읽기·쓰기. 웹과 같은 쿼리 키 구조를 쓴다.
- `usePushTokenSync`: 로그인 상태이고 권한이 있으면 진입 시 `messaging().getToken()`으로 받은 토큰을 `POST /push-tokens`(platform `"ios"`, 실제로는 `Platform.OS`)에 보낸다. `onTokenRefresh`도 구독해서 다시 등록한다.
- `useReminderRefresh`: 웹과 같은 지문(id, dueAt, status, archived, reminderOffsetMinutes)으로 todos 캐시 변화를 관찰한다. 2초 디바운스 뒤 `POST /reminders/refresh`를 보낸다. 지문 함수는 core로 옮겨 웹과 함께 쓴다. **(내 판단)** 웹과 지문 규칙이 갈라지지 않게 하려는 것이다.
- 포그라운드 수신: `messaging().onMessage`로 받아 앱 안 토스트를 띄운다(앱에 있는 토스트를 쓰고, 없으면 가벼운 배너). 3초 뒤 기록을 다시 조회한다. iOS는 앱이 열려 있으면 시스템 알림을 띄우지 않으므로, 이 처리가 없으면 알림이 조용히 사라진다.
- 알림 탭: `onNotificationOpenedApp`(백그라운드)과 `getInitialNotification`(종료 상태)에서 `data.todoId`를 꺼내 할 일 상세로 이동한다. 로그인·네비게이션이 준비되기 전에 탭이 들어오면 준비될 때까지 보류한다. 할 일이 없으면(삭제됨) 기존 상세 화면의 없는 할 일 처리를 따른다.
- 권한 요청: 웹 `ReminderPromptProvider`와 같은 흐름이다. 마감 있는 할 일을 처음 저장한 직후, 앱 안 안내("마감 전에 알려드릴까요?")를 먼저 보여 주고 "켜기"를 누르면 OS 권한을 요청한다. 앱 안 안내의 "나중에"는 웹과 같은 기간만큼 다시 묻지 않는다. 이렇게 하는 이유는 iOS에서 권한을 한 번 거절하면 앱 안에서 다시 물을 수 없어서다. 이미 거절했다면 설정 화면에 "iOS 설정에서 켜기" 링크(`Linking.openSettings()`)를 보여 준다. 이 안내는 폼 화면의 자식이 아니라 앱 최상위에 둔다. 폼이 닫힐 때 같이 사라지지 않게 하려는 것이다(BottomSheet unmount 교훈).

### 5.4 화면
- **알림 기록**: 모든 스택 헤더 오른쪽(계정 아이콘 옆)에 벨 아이콘과 미읽음 배지를 둔다. 누르면 "알림" 화면(스택 화면)으로 간다.
  - 위쪽에는 권한 상태와 "기본 알림 시점" 선택이 있다.
  - 아래쪽에는 기록 목록이 있다. 항목을 누르면 할 일 상세로 간다.
  - 화면에 들어오면 `seen`을 처리한다.
  - **(내 판단)** 웹의 벨 메뉴 구성(권한 상태 + 기본값 + 기록)을 한 화면으로 옮긴 것이다.

```
[ 알림                      ]
 알림: 켜짐  (꺼짐이면 [켜기] / [iOS 설정 열기])
 기본 알림 시점   [ 30분 전 ▾ ]
 ───────────────────────────
 ● 보고서 제출   30분 후 마감이에요   오후 2:30
   장보기       지금 마감이에요       어제
```

- **계정 화면**: 기본 알림 시점 항목을 하나 더 두지 않고, 알림 화면 링크 한 줄만 둔다. **(내 판단)** 설정 위치가 두 군데로 갈라지지 않게 하려는 것이다.
- **할 일 폼**: 마감이 있거나 반복일 때만 "알림" 선택을 보인다. 선택지는 "기본값(30분 전)" / 알림 없음 / 정각 / 10분 / 30분 / 1시간 / 하루 전이다. 저장 값 규칙은 웹 `todoForm`과 같다. 기본값을 고르면 null이고, 마감과 반복이 둘 다 없으면 null이다. 추가, 수정, 반복 생성, 반복 시리즈 수정 모든 경로에 `reminderOffsetMinutes`를 전달한다. 상세 화면에 현재 알림 설정을 보여 줄지는 구현자 재량이다.

### 5.5 로컬 알림 제거
- `scheduleReminder.ts`와 `reminderTime.ts`, 그리고 `useCreateTodo`/`useUpdateTodo`/`useCreateRecurringTodo`의 호출과 관련 테스트를 지운다.
- 이미 걸린 로컬 예약이 서버 푸시와 겹쳐 두 번 울리지 않게, 앱 시작 시 한 번 `cancelAllScheduledNotificationsAsync()`를 부른다. 앱에 다른 로컬 예약 용도는 없다. 출시 전이라 영향받는 사람은 개발 빌드 사용자뿐이지만 비용이 적어서 넣는다.
- `expo-notifications`는 권한 조회 등에 계속 쓸 수 있으면 남긴다. 다 쓸 수 없게 되면 제거할지 구현자가 판단한다.

### 5.6 로그아웃 / 탈퇴
- 로그아웃은 `signOut.ts`에서 firebase signOut **전에** 처리한다. 이후엔 ID 토큰이 없기 때문이다.
  1. `DELETE /push-tokens`(현재 토큰)
  2. `messaging().deleteToken()`
- 서버 삭제나 기기 `deleteToken()`이 실패하면(오프라인 등) AsyncStorage에 "해제 대기"를 저장한다. 저장 항목은 `{ token, uid, serverDeleted, deviceDeleted }`다.
- 다음 토큰 동기화는 **새 토큰을 받거나 등록하기 전에** 해제 대기부터 처리한다.
  1. `deviceDeleted`가 false면 계정과 무관하게 먼저 `deleteToken()`을 다시 시도한다. 성공해야 다음 단계로 넘어간다. 실패하면 이번 동기화는 등록하지 않고 끝낸다. 이렇게 해야 다른 계정(B)으로 로그인했을 때 `getToken()`이 앞 계정(A)의 토큰을 그대로 돌려받아 A의 알림이 B 기기에 오는 일을 막을 수 있다. 기기 토큰이 무효가 되면 A의 DO에 남은 옛 토큰은 다음 발송 때 `UNREGISTERED`로 정리된다.
  2. `serverDeleted`가 false이고 지금 uid가 대기 uid와 같을 때만 `DELETE /push-tokens`를 재시도한다. 다른 계정의 ID 토큰으로는 지울 수 없기 때문이다. uid가 다르면 위 정리에 맡기고 대기를 지운다.
- 웹 스펙 결정("로그아웃 시 토큰 해제, 오프라인이면 pending 표시 후 다음 sync에서 삭제")을 앱 사정에 맞춘 것이다. **(내 판단, 검토 반영)**
  - 웹 스펙 결정("로그아웃 시 토큰 해제, 오프라인이면 pending 표시 후 다음 sync에서 삭제")을 앱 사정에 맞춘 것이다. 기기 토큰을 지우면 서버에 남은 옛 토큰은 다음 발송 때 무효 처리돼 정리된다.
- 탈퇴: 기존 `DELETE /account` 호출을 유지한다. 기기 `deleteToken()`도 함께 부른다.

## 6. 사용자 작업 목록
1. Apple Developer에서 APNs 인증 키(.p8)를 만든다(Key ID, Team ID 메모). 이미 있으면 재사용한다.
2. Firebase 콘솔 → 프로젝트 설정 → Cloud Messaging → Apple 앱 구성에 APNs 인증 키를 올린다.
3. App ID에 Push Notifications capability가 켜져 있는지 확인한다. EAS 관리 자격증명이면 빌드 때 자동으로 켜질 수 있다.
4. 네이티브 모듈이 추가돼 EAS development-device 빌드를 다시 해야 한다. 빌드 전에 동의를 받는다.
5. reminder-proxy 배포는 CI가 develop→main 릴리스 때 한다. 앱보다 먼저 나가야 한다.

## 7. 검증
- 단위 테스트:
  - Worker `fcm.test.ts`(apns 블록, expiration 계산), `router.test.ts`(ios 허용)
  - 앱 훅(토큰 동기화, 해제 대기, refresh 지문, 탭 이동, 폼의 reminderOffsetMinutes 전달)
  - core 지문 함수
- 기존 웹·Worker 테스트 전부 통과(웹 무변경 확인).
- 실기기(dev 빌드):
  - 앱 종료 상태에서 웹으로 마감 수정 → 바뀐 시각에 한 번만 온다.
  - 완료하면 알림이 오지 않는다.
  - 기본값 off면 전부 오지 않는다.
  - 할 일별 재지정이 적용된다.
  - 포그라운드에서 토스트가 뜨고 기록이 갱신된다.
  - 알림을 탭하면 상세로 간다(종료/백그라운드 상태 각각).
  - 로그아웃 후 오지 않는다.
  - 웹과 앱 둘 다 켠 상태에서 각 기기에 한 번씩 온다.

## 8. 구현자에게 맡기는 것
- 토스트/배너 구현 방식, 벨 배지 스타일(앱 디자인 토큰 사용).
- 알림 화면의 빈 상태·로딩 문구.
- 웹 코드에서 core로 옮길 수 있는 순수 로직의 범위(지문, 선택지 파싱 등). 단 웹 동작은 바꾸지 않는다.
- `expo-notifications` 유지 여부(§5.5).
