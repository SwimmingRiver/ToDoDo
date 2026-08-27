# 고객 의견 수집 기능 설계

## 배경 / 목적

웹 클라이언트 사용자로부터 자유 형식 의견(피드백)을 받을 수 있는 기능이 없다.
로그인한 사용자가 앱 내에서 바로 의견을 남길 수 있게 하여, 버그 제보나 개선
요청 등을 별도 채널(이메일, SNS 등) 없이도 수집할 수 있게 한다.

## 범위

- 자유 형식 텍스트 피드백만 다룬다. 카테고리 구분, NPS/평점 설문은 범위 밖.
- 저장은 Firestore로 한정한다. Notion 등 외부 서비스 동기화는 이번 범위에
  포함하지 않는다 — Notion API는 브라우저 CORS를 지원하지 않아 직접 호출이
  불가능하고, 중계하려면 Cloud Functions + Firebase Blaze 플랜 전환이라는
  새 인프라가 필요하다. 이는 별도 후속 작업으로 미룬다.
- 제출된 피드백을 앱 안에서 열람하는 관리자 화면은 만들지 않는다. 확인은
  Firebase 콘솔에서 한다(관리자 권한이므로 보안 규칙에 read를 허용하지 않아도
  콘솔에서는 조회 가능).

## 데이터 모델

`feedback` 컬렉션, 문서당 필드:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `userId` | string | `auth.currentUser.uid` |
| `email` | string | `auth.currentUser.email` |
| `content` | string | 사용자가 입력한 텍스트, 공백 trim 후 1~1000자 |
| `createdAt` | Timestamp | `serverTimestamp()` |

## 보안 규칙

`firestore.rules`에 `todos`와 대칭되는 블록을 추가한다.

```
match /feedback/{feedbackId} {
  function contentValid() {
    let c = request.resource.data.content;
    return c is string && c.size() > 0 && c.size() <= 1000;
  }

  allow create: if request.auth != null
                && request.resource.data.userId == request.auth.uid
                && request.resource.data.email == request.auth.token.email
                && contentValid();
  allow read, update, delete: if false;
}
```

`read/update/delete`를 클라이언트에 전혀 허용하지 않는다 — 제출 전용
컬렉션이므로 본인 것이라도 다시 읽거나 고칠 필요가 없다. 관리자 조회는
Firebase 콘솔(Admin 권한, 규칙 우회)로 한다.

## 클라이언트 구조

`client/CLAUDE.md`의 `api/ → hooks/ → components/` 의존 순서를 따라
`src/features/feedback/`를 신설한다.

- `api/feedbackApi.ts`
  - `submitFeedback(content: string): Promise<void>`
  - `todoApi.ts`와 동일한 패턴: `auth.currentUser`가 없으면 에러 throw,
    있으면 `addDoc(collection(db, "feedback"), {...})` 호출.
- `hooks/useFeedback.ts`
  - TanStack Query `useMutation`으로 `submitFeedback`을 감싼다.
    `isPending` / `isSuccess` / `isError` 상태를 컴포넌트에 노출한다.
- `components/feedbackButton.tsx`
  - 버튼 + 모달을 캡슐화한 자기완결형 컴포넌트. 내부에 모달 열림
    상태(`useState`)를 갖고 있어, 사용하는 쪽(헤더/드로어)이 상태를
    끌어올릴 필요가 없다.
  - 모달: textarea(placeholder 안내, 1000자 제한 및 카운터), 제출 버튼
    (내용이 비어 있으면 비활성화).
  - 제출 성공 시: 짧은 "감사합니다" 안내 후 자동으로 모달 닫힘.
  - 제출 실패 시: 입력했던 내용을 유지한 채 인라인 에러 메시지 표시,
    재시도 가능. `todoApi.ts`와 동일하게 `Sentry.captureException`으로
    기록한다.

## 진입점

- `src/layouts/header/header.tsx`: `LogoutButton` 옆에 `<FeedbackButton />`
  배치 (PC).
- `src/layouts/snb/mobileDrawer.tsx`: `LogoutButton` 옆에 `<FeedbackButton />`
  배치 (모바일).
- 별도 설정 페이지는 만들지 않는다. 앱에 아직 설정 메뉴 자체가 없고,
  현재는 이 항목 하나뿐이라 새 페이지를 만드는 게 과설계다(YAGNI). 설정
  항목이 늘어나면 그때 설정 페이지로 승격한다.

## 에러 처리

- 미인증 상태에서 `submitFeedback` 호출 시 `feedbackApi`가 즉시 에러를
  던진다 (다른 api 모듈과 동일 패턴). 이 기능은 로그인 후에만 노출되는
  버튼이라 실사용 경로에서는 발생하지 않지만, 방어적으로 유지한다.
- Firestore 쓰기 실패(네트워크 등): 모달에 에러 메시지 표시, 입력값 보존,
  Sentry로 캡처.

## 테스트

- `feedbackApi.submitFeedback` 유닛 테스트: `addDoc` mock, 저장되는 필드
  (`userId`/`email`/`content`/`createdAt`) 검증. 미인증 시 에러 throw 검증.
- `feedbackButton` 컴포넌트 테스트: 빈 입력 시 제출 버튼 비활성화, 제출
  성공/실패 시 상태 전환 렌더링.
- `firestore.rules`: 이 프로젝트에는 규칙 전용 유닛테스트 스위트가 없고
  기존 `todos` 규칙도 마찬가지다. 새로 도입하지 않고 기존 관례를 따른다.

## 후속 작업 (범위 밖)

- Notion 동기화: Cloud Functions `onCreate` 트리거로 `feedback` 문서 생성 시
  Notion에 자동 기록. Firebase Blaze 플랜 전환이 선행 조건.
- 설정 페이지 신설 시 이 버튼을 그 안으로 이동.
