## 코드 컨벤션

**파일명**: `camelCase.tsx`

**피처 구조**: `api/` → `hooks/` → 컴포넌트 순서로 의존합니다.

**커스텀 훅**: `useTodo()`처럼 도메인 단위로 query/mutation을 묶어 반환합니다.
단, 리스트 행처럼 반복 렌더링되는 컴포넌트(`todoListItem`, `childTodoCard`,
`projectCard` 등)는 `useTodo()` 전체를 호출하지 말고 실제로 쓰는 mutation만
독립 훅(`useDeleteTodo`, `useUpdateTodo`)으로 가져다 쓰세요. 행 개수만큼
불필요한 mutation·쿼리 옵저버가 생성되는 걸 막기 위함입니다.

**라우팅**: `/login`을 제외한 모든 페이지는 `ProtectedRoute`로 보호합니다.

## 디자인 요소

브랜드색은 역할로 나뉩니다. 이름이 용도를 말하므로 값 대신 역할로 고르세요.

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `brand.strong` | `#0F6E56` | 글자·아이콘, 흰 글자를 얹는 솔리드 배경, 포커스 신호 |
| `brand.strongHover` | `#0A4E3C` | 위 요소들의 hover / active |
| `brand.fill` | `#1D9E75` | 흰색·회색 배경 위에, **글자를 얹지 않는** 장식 |
| `brand.tint` | `#E8F5EF` | 연한 배경 |

`brand.fill`은 흰색과 3.39:1이라 글자에 쓰면 WCAG AA(4.5:1)에 미달합니다.
연한 초록 배경 위에서는 비텍스트 기준(3:1)마저 깨집니다.
근거는 `docs/superpowers/specs/2026-08-11-brand-color-contrast-aa-design.md` 참고.

## 데이터 모델

`Todo` 타입 정의는 `client/src/features/todo/types/todo.type.ts` 참고 (반복 규칙 `RecurrenceRule`, `archived`/`overdueArchived` 등 파생 필드 포함).

`Entitlement`(구독/플랜 상태) 타입 정의는 `client/src/features/entitlement/types/entitlement.type.ts` 참고. `entitlements/{uid}` 문서가 없으면 free로 취급하고(백필 불필요), 클라이언트는 이 컬렉션에 쓰기를 할 수 없다(firestore.rules에서 `write: if false`) — 지금은 운영자가 `scripts/grantEntitlement.ts`(`npm run grant:entitlement -- --uid <uid> --plan premium|free`)로 문서와 Firebase Auth 커스텀 클레임(`premium`)을 함께 설정하고, 결제 웹훅이 붙기 전까지는 이 상태로 유지된다. `firestore.rules`와 calendar-proxy는 이 문서가 아니라 커스텀 클레임을 읽어 서버 사이드로 프리미엄 여부를 강제한다. 단, 커스텀 클레임은 클라이언트의 ID 토큰이 갱신되어야 반영되므로(최대 1시간, 또는 재로그인 전까지는 이전 값이 유지됨) 부여/회수 직후에는 클라이언트와 서버의 판정이 잠시 어긋날 수 있다. 프리미엄 여부는 `useIsPremium()` 훅으로만 확인하고, 다른 기능에서 `plan`/`status` 필드를 직접 비교하지 않는다.
