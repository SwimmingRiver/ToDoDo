# 모바일 앱(React Native) 출시 — 아키텍처 설계

- 대상: 신규 `mobile/`(Expo 앱), 신규 `packages/core/`(공유 로직), 루트 `package.json`(신규, npm workspace)
- 작성일: 2026-08-20
- 상태: 사용자 검토 대기 (승인 시 `writing-plans` → 구현)

## 0. 배경

ToDoDo는 현재 React 웹 클라이언트(`client/`)가 Firebase(Auth + Firestore)를 직접 호출하는 구조로, `styled-components`, `dnd-kit`(칸반), `FullCalendar`(대시보드)로 구성돼 있다. 반응형 웹으로 모바일 브라우저 대응은 하고 있지만, 앱스토어/플레이스토어 노출과 진짜 네이티브 성능·제스처감, 푸시 알림을 원해 별도 모바일 앱 출시를 검토했다.

브레인스토밍 과정에서 확인된 제약과 결정:

| 항목 | 결정 |
| --- | --- |
| 출시 동기 | 스토어 노출, 푸시 알림, 네이티브 성능/제스처감 (오프라인 사용은 아님) |
| 개발 리소스 | 혼자 개발, 시간 여유 있음 |
| v1 범위 | 핵심 할일 관리만 (칸반·캘린더는 이후 단계) |
| 기술 스택 | React Native(Expo) — Capacitor는 WebView 렌더링이라 "네이티브 성능/제스처감" 동기를 충족 못 해 배제 |

`dnd-kit`과 `FullCalendar`는 DOM 전용 라이브러리라 React Native에서 재사용이 불가능하다. v1에서 칸반·캘린더를 제외한 것은 이 재작성 비용을 뒤로 미루기 위한 의도적 스코프 결정이다.

## 1. 결정된 설계 개요

- Expo 기반 React Native 앱을 `mobile/`에 신규 생성한다.
- UI에 묶이지 않은 로직(타입, Firestore api 레이어)을 `packages/core/`로 분리해 웹·모바일이 공유한다. TanStack Query 훅 자체는 `useAuthState` 같은 플랫폼별 인증 연동에 묶여 있어 `mobile/`에 두고, `packages/core`는 그 훅이 호출하는 순수 api 함수까지만 제공한다.
- 기존 `client/`는 물리적으로 옮기지 않는다 — 실서비스가 돌고 있어 이동 자체가 회귀 리스크다. npm workspace로 재구성하는 대신, `mobile/package.json`(그리고 향후 `client/package.json`)에 `"@tododo/core": "file:../packages/core"`로 로컬 의존성만 연결한다. 루트 `package.json`(husky/lint-staged 설정)은 건드리지 않는다.
- v1 인증은 `@react-native-google-signin/google-signin` + Firebase `signInWithCredential`. Auth persistence는 `initializeAuth` + `getReactNativePersistence(AsyncStorage)`로 명시 설정한다.
- 알림은 서버 없이 **기기 내 로컬 알림**(Expo Notifications, `dueAt` 기준 예약)으로 시작한다.
- 스토어 배포는 EAS Build/Submit.

### 명시적으로 채택하지 않은 것

- **Capacitor로 기존 웹앱 래핑**: 개발 기간은 가장 짧지만 WebView 렌더링이라 스크롤·드래그 등 네이티브 제스처감을 얻지 못한다. 이번 출시 동기의 핵심을 충족 못 해 배제.
- **`client/`를 `apps/web/`로 이동하는 완전한 모노레포 재구성**: import 경로, CI 경로, Firebase Hosting 배포 설정을 모두 건드리게 되어 실서비스 회귀 리스크가 크다. 지금은 `packages/core` 신설만 하고, `client/` 내부 파일 이동·마이그레이션은 하지 않는다.
- **npm workspaces 전환**: 루트 `package.json`에 `workspaces` 필드를 추가하면 `client/`의 독립된 `package-lock.json`이 루트 lockfile로 합쳐져 재설치가 필요해지고, CI/배포 스크립트도 재검증해야 한다. `client/`는 실서비스가 돌고 있어 이 리스크를 지금 감수할 이유가 없다 — `file:` 로컬 의존성으로 충분하다.
- **RN Firebase(네이티브 모듈) 사용**: Firebase JS SDK로 통일해야 `packages/core`의 Firestore api 함수를 웹·모바일이 그대로 공유할 수 있다. 네이티브 모듈은 API 형태가 달라 공유가 깨진다.
- **v1에 칸반·캘린더 포함**: 재작성 비용이 가장 큰 두 화면을 미뤄 v1 출시 리스크를 낮춘다. 이후 단계에서 별도 설계로 다룬다.
- **서버발 푸시(FCM/Expo Push + Cloud Function)**: 로컬 알림만으로 v1의 "할 일 마감 리마인더" 요구는 충족된다. 다른 기기 간 알림 동기화 같은 요구가 생기면 그때 별도 설계.
- **RN E2E(Detox/Maestro)**: 혼자 개발 리소스로는 과한 투자. v1은 유닛 테스트로 커버.

## 2. 모듈 구조

```
tododo/
├── package.json          [신규] 루트 npm workspace 설정
├── client/                (기존, 이동 없음) workspace 멤버로 편입
├── mobile/                [신규] Expo 앱
│   ├── App.tsx
│   ├── src/
│   │   ├── navigation/    # React Navigation 스택 (인증 상태 분기)
│   │   ├── screens/       # TodoListScreen, TodoDetailScreen, LoginScreen 등
│   │   └── firebase/      # RN 전용 Firebase 초기화 (persistence 설정)
│   └── app.json           # Expo 설정 (번들 ID, 아이콘, 스플래시)
├── packages/
│   └── core/               [신규] 웹·모바일 공유 로직
│       ├── types/          # Todo 등 타입 정의 (client/src에서 이동)
│       ├── api/             # Firestore CRUD 함수 (client/src/features/todo/api에서 이동)
│       └── hooks/           # TanStack Query 훅 로직 (플랫폼 무관한 부분만)
├── server/                (손대지 않음)
└── docker-compose.yml     (손대지 않음)
```

`packages/core`로 옮기는 파일은 **DOM/RN 어느 쪽에도 의존하지 않는 것**만 대상이다. Firebase 초기화 자체는 웹과 RN이 옵션이 달라(웹은 기본 persistence, RN은 AsyncStorage persistence 명시) 공유하지 않고, 각 플랫폼(`client/src/shared/firebase.ts`, `mobile/src/firebase/index.ts`)에서 각자 초기화한 `Firestore`/`Auth` 인스턴스를 `packages/core`의 api 함수에 주입하는 형태로 연결한다.

```ts
// packages/core/api/todoApi.ts (개념)
export const createTodoApi = (db: Firestore) => ({
  getTodos: (userId: string) => { /* ... */ },
  createTodo: (userId: string, fields: TodoFields) => { /* ... */ },
  // ...
});
```

각 플랫폼은 자신의 `db` 인스턴스로 `createTodoApi(db)`를 호출해 사용한다. 이 팩토리 패턴 덕에 `packages/core`는 Firebase 초기화 방식 차이를 몰라도 된다.

## 3. 인증

웹의 `signInWithPopup`은 RN에 없다. RN 표준 패턴:

```ts
// mobile/src/firebase/auth.ts (개념)
GoogleSignin.configure({ webClientId: FIREBASE_WEB_CLIENT_ID });

const signIn = async () => {
  await GoogleSignin.hasPlayServices();
  const { idToken } = await GoogleSignin.signIn();
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
};
```

Auth persistence는 초기화 시점에 명시해야 한다:

```ts
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
```

`ProtectedRoute` 패턴은 React Navigation에서 인증 상태에 따라 스택을 분기하는 조건부 네비게이터로 재구현한다 — 개념(비로그인 시 로그인 화면으로)은 동일, 구현체만 플랫폼별.

## 4. 데이터 계층

`packages/core`의 api 함수는 Firebase JS SDK를 그대로 사용하므로 웹·RN 양쪽에서 동일하게 동작한다. `userId` 필터링 등 기존 Firestore 쿼리 규칙(`firestore.rules` 포함)은 변경 없이 그대로 적용된다 — RN 클라이언트도 동일한 Firestore 프로젝트, 동일한 규칙을 쓴다.

v1 데이터 범위: `Todo`의 `title`, `description`, `status`, `priority`, `startAt`, `dueAt`, `parentId`, `order` — 목록·CRUD·상태 변경에 필요한 필드 전부. 하위 할 일(`parentId`) 계층은 목록 뷰에서도 의미가 있어 v1에 포함한다(칸반 카드 형태가 아니라 들여쓰기된 리스트 형태로 표현).

## 5. 푸시 알림

v1은 서버 없이 **로컬 알림**만 구현한다:

```ts
// mobile/src/notifications/scheduleReminder.ts (개념)
Notifications.scheduleNotificationAsync({
  content: { title: todo.title, body: "마감 시간입니다" },
  trigger: { date: new Date(todo.dueAt) },
});
```

할 일이 생성/수정될 때 `dueAt`이 있으면 알림을 예약하고, 완료 처리되거나 `dueAt`이 바뀌면 기존 예약을 취소 후 재예약한다. Cloud Functions나 별도 서버 인프라가 필요 없어 v1 범위에 적합하다.

## 6. 스토어 배포

- EAS Build로 iOS/Android 빌드, EAS Submit으로 스토어 제출까지 처리.
- Apple Developer Program 연 $99, Google Play 최초 등록비 $25.
- 앱 아이콘, 스플래시 스크린, 번들 ID(`com.tododo.app` 등 신규 결정 필요), 스토어 등록 정보(설명, 스크린샷)는 별도 준비 필요.

## 7. 테스트 전략

- `packages/core`: 기존 `client/`의 Vitest 컨벤션을 그대로 따른다 — Firestore를 모킹한 유닛 테스트. 웹과 RN이 같은 함수를 쓰므로 여기서 한 번 검증하면 양쪽에 적용된다.
- `mobile/`: Jest + React Native Testing Library로 화면/컴포넌트 유닛 테스트.
- RN E2E(Detox/Maestro)는 v1 범위 밖(위 "명시적으로 채택하지 않은 것" 참고).
- 기존 `client/` Playwright E2E는 변경 없음 — 웹 코드를 옮기지 않으므로 회귀 없음.

## 8. v1 기능 범위

**포함**: Google 로그인, 할 일 목록(하위 할 일 포함), CRUD, 상태 변경(todo/doing/done), priority, dueAt 기반 로컬 알림.

**제외**: 칸반 보드, 캘린더 대시보드, 서버발 푸시, 오프라인 동기화.

## 9. 범위 밖 (기록)

- 칸반 보드·캘린더 대시보드의 RN 포팅 — `dnd-kit`/`FullCalendar` 대체 라이브러리(`react-native-draggable-flatlist`, `react-native-big-calendar` 등) 선정이 필요한 별도 설계 대상.
- 서버발 푸시 알림(다른 기기 동기화) — 필요성이 확인되면 Expo Push + Cloud Function 트리거로 별도 설계.
- `client/`를 `apps/web/`로 옮기는 완전한 모노레포 재구성.
- 프리미엄 유료 버전(AI 계획 짜기), 사용자 리뷰 수집 — 별도 브레인스토밍 대상 (이번 설계와 독립).
