# 브랜드 컬러 대비 AA 확보 — 역할 기반 토큰 재정의

작성일: 2026-08-11
브랜치: `fix/brand-color-contrast-aa`

## 문제

`colors.brand.secondary`(`#1D9E75`)는 흰색과의 대비가 **3.39:1**이다. WCAG AA 본문 텍스트 기준
4.5:1에 미달한다. 그런데 이 값이 앱 전역에서 두 가지 방식으로 텍스트에 쓰이고 있다.

1. **글자·아이콘 색으로 직접** — 약 20곳
2. **솔리드 버튼 배경으로, 그 위에 흰 글자** — 8곳 (흰 글자 기준으로도 똑같이 3.39:1)

2번이 특히 크다. 랜딩 주 CTA 버튼, 모달 제출 버튼, 빈 상태 액션 버튼, 에러바운더리 새로고침
버튼 등 **사용자가 누르라고 만든 버튼이 전부** 여기 해당한다. 패턴이 예외 없이 동일하다:

```
background-color: ${colors.brand.secondary};   /* 3.39:1 */
color: white;
&:hover { background-color: ${colors.brand.primary}; }   /* 6.20:1 — hover만 통과 */
```

즉 **기본 상태가 미달이고 hover에서만 기준을 만족하는** 상태다.

### 근본 원인

토큰 이름이 `primary` / `secondary`라서 **어느 쪽이 텍스트에 안전한지 이름이 말해주지 않는다.**
값만 보고 골라야 하는데, 밝은 `#1D9E75`가 더 "브랜드다워" 보이므로 자연스럽게 그쪽이 선택됐다.

같은 뿌리에서 파생된 문제: `CLAUDE.md`는 "primary color는 #1D9E75, 톤 다운용은 #0F6E56"으로
서술하는데 `colors.ts`는 `primary: "#0F6E56"`, `secondary: "#1D9E75"`로 **정반대**다. 문서를
읽은 쪽과 코드를 읽은 쪽이 "primary를 쓰자"는 같은 말로 다른 값을 집는다.

## 결정: 역할 기반 토큰

이름이 **용도**를 말하게 한다. `primary`/`secondary`/`background`는 전부 사라진다.

```ts
brand: {
  strong:      "#0F6E56",  // 6.20:1  글자·아이콘, 흰 글자를 얹는 솔리드 배경, 포커스 신호
  strongHover: "#0A4E3C",  // 9.69:1  위 둘의 hover / active
  fill:        "#1D9E75",  // 글자를 얹지 않는 장식·데이터 표현 전용
  tint:        "#E8F5EF",  // 연한 배경
}
```

`strong`이 텍스트와 솔리드 배경 양쪽을 겸하는 이유: 흰 배경 위 글자든 그 위에 얹은 흰 글자든
같은 6.20:1이다. 한 값으로 양방향이 커버되므로 토큰을 나눌 이유가 없고, `color:`와
`background:` 어느 쪽에 써도 이름이 어색하지 않다.

`fill`의 정의는 정확히 **"글자를 얹지 않는 배경"**이다. 이 경계를 지키는 한 `#1D9E75`는
비텍스트 3:1 기준을 3.39:1로 통과한다.

### hover 값 근거

| 값 | 흰색 대비 | `#0F6E56`에서의 변화폭 |
|---|---|---|
| `#1D9E75` (현재 기본) | 3.39:1 ❌ | — |
| `#0F6E56` (`strong`) | 6.20:1 ✅ | — |
| `#0C5C47` | 7.96:1 ✅ | 1.28:1 (너무 미묘) |
| **`#0A4E3C`** (`strongHover`) | **9.69:1 ✅** | **1.56:1** |
| `#083D2F` | 12.22:1 ✅ | 1.97:1 (거의 검정) |

현재 hover 변화폭(`#1D9E75`→`#0F6E56`)이 1.83:1이다. `#0A4E3C`의 1.56:1은 그보다 약간
은은하지만 분명히 인지되고, `#083D2F`처럼 비활성 버튼으로 오인될 만큼 어둡지 않다.

## 변환 규칙

기계적 치환이 아니다. `secondary`가 쓰이던 자리는 **용도에 따라 `strong`과 `fill`로 갈린다.**

| 현재 | 용도 | 변경 후 |
|---|---|---|
| `secondary` → `color:` | 글자·아이콘 | `strong` |
| `secondary` → 솔리드 배경 (+흰 글자) | 버튼 | `strong` |
| `secondary` → hover `primary` | 시프트 | `strong` → hover `strongHover` |
| `secondary` → `&:focus` 테두리 / `outline` | 포커스 신호 | `strong` |
| `secondary` → 컴포넌트 윤곽 (내부 텍스트와 한 쌍) | 버튼 테두리 2곳 | `strong` |
| `secondary` → 프로그레스·색점·체크·스피너·스켈레톤 | 장식 | `fill` (값 유지) |
| `primary` (이미 대비 통과) | 전부 | `strong` (이름만) |
| `background` | 연한 배경 | `tint` (이름만) |

### 포커스 신호를 `strong`으로 올리는 이유

비텍스트 3:1 기준으로는 `#1D9E75`(3.39:1)도 통과한다. 그럼에도 올리는 이유는 **여유가
0.39뿐**이라서다. 포커스 링은 "지금 입력이 여기 있다"를 알리는 유일한 신호이고, 키보드
사용자에게는 대체 수단이 없다. 기준선에 걸친 채로 두면 배경색을 한 번만 조정해도 깨진다.

해당 위치: `&:focus` / `&:focus-within` 테두리 8곳(`todoFrom.styles` 3, `todoDetail.styles` 3,
`todoSearch.styles` 1, `guestAddTodoInput.styles` 1), `outline` 10곳.

### 윤곽 테두리를 `strong`으로 올리는 2곳

`ctaButtons.styles:42`(보조 CTA 버튼)와 `calendar.styles:195`(캘린더 버튼)은 테두리와 그 안의
글자가 **같은 토큰을 공유하는 한 쌍**이다. 글자가 `strong`으로 가는데 테두리만 `fill`로 남기면
같은 버튼 안에서 두 초록이 어긋난다. 함께 `strong`으로 올린다.

### `fill`로 남는 곳

글자가 얹히지 않는 것만 남는다: `dailyProgress` 프로그레스 채움, `projectCard` 색 점과 진행
바, `todayTodoItem` 완료 체크 배경, `checkboxSkeleton` stroke, `kanbanSkeleton`, 로딩 스피너
2곳(`todoSearch.styles:84`, `calendar.tsx:336`).

## 함께 정리하는 하드코딩

토큰을 우회한 리터럴이 섞여 있다. 이름을 바꾸는 김에 같이 흡수한다.

| 값 | 위치 | 문제 | 처리 |
|---|---|---|---|
| `#E8F4F1` × 3 | `snb.tsx:104,113`, `mobileDrawer.styles:113` | 브랜드 `tint`(`#E8F5EF`)와 **미묘하게 다른 제2의 틴트** | `tint`로 통일 |
| `#e8f0fe` × 2 | `todoSearch.styles:119`, `bottomSheet.styles:108` | **파란색** — 브랜드와 무관 | `tint`로 교체 |
| `#1D9E75` × 2 | `snb.tsx:108`, `mobileDrawer.styles:114` | border-left 토큰 우회 | `fill` |
| `#e8f5ef !important` | `calendar.styles:25` | 소문자 인라인 | `tint` |
| `rgba(29, 158, 117, …)` × 4 | `todoSearch.styles:44`, `todoDetail.styles:158,275,308` | `#1D9E75`의 RGB를 푼 포커스 글로우 | `rgba(15, 110, 86, …)`로 교체 |
| `rgba(15, 110, 86, …)` × 4 | `todoDetail.styles:383~` | `#0F6E56`의 RGB를 푼 그림자 | 유지 (값은 맞음) |

포커스 글로우는 바로 옆 `border-color`와 한 몸이다. 테두리가 `strong`(`#0F6E56`)으로 가므로
글로우도 그 RGB인 `rgba(15, 110, 86, …)`가 되어야 한다. 알파값은 각 위치의 기존 값을 유지한다.

`#e8f0fe`가 파란색인 건 리브랜딩 이전 잔재로 보인다. 검색 취소 버튼 hover와 바텀시트 선택
항목에서 브랜드 초록 옆에 파란 배경이 깔린다.

`statusColors.ts:13`의 `main: "#1D9E75"`는 **범위 밖**이다. 할 일 상태(done)를 나타내는 별도
색 체계이고, 배지 배경으로 쓰이는지 텍스트로 쓰이는지 따로 확인이 필요하다. 이번에 건드리면
스코프가 또 번진다.

## 재발 방지: 대비 유닛 테스트

`colors.ts`의 토큰이 각자의 역할에 맞는 대비 기준을 만족하는지 계산해서 검증한다.
`statusColors.test.ts`가 이미 있으므로 같은 자리에 둔다.

`src/styles/__tests__/brandContrast.test.ts`:

- `strong` vs `#FFFFFF` ≥ 4.5:1 (흰 배경 위 글자, 그리고 그 위 흰 글자 양방향)
- `strong` vs `tint` ≥ 4.5:1 (연한 배경 위 글자)
- `strongHover` vs `#FFFFFF` ≥ 4.5:1
- `strongHover`와 `strong`의 상호 대비 ≥ 1.2:1 (hover가 눈에 보이는지)
- `fill` vs `#FFFFFF` ≥ 3:1 (비텍스트 기준)

WCAG 상대 휘도 공식을 테스트 파일 안에 직접 구현한다. 색 계산 라이브러리를 새로 들이는 건
번들과 무관한 테스트 전용 의존성이라 과하다.

**이 테스트가 잡지 못하는 것**: 토큰의 *값*은 검증하지만 *사용처*는 검증하지 못한다. 누군가
`fill`을 글자색에 쓰면 테스트는 통과한다. 그건 이번 스코프 밖이고, 토큰 이름이 용도를
말해주는 것으로 1차 방어한다.

## CLAUDE.md 갱신

"디자인 요소" 섹션이 사라진 이름(`primary`/`secondary`)을 서술하고 있고 값도 반대다.
새 토큰 4개와 각자의 용도로 교체한다.

## 검증

- `npm run lint` / `tsc` 통과
- `npm run test` — 기존 유닛 + 신규 대비 테스트
- `npm run test:e2e` — 24개 (로컬 실행 시 JDK 21 필요)
- 시각 확인: 랜딩, 로그인, 오늘, 목록, 상세, 칸반, 캘린더, 게스트 — 솔리드 버튼과 포커스 링이
  의도대로 어두워졌는지, `fill`로 남긴 장식이 밝기를 유지하는지

## 범위

약 34개 파일. 피처 전 영역(landing/today/todo/dashboard/kanban/guest) + `shared/ui` 7개 +
`layouts` 5개 + `styles` 1개.

한 PR로 간다. 토큰 이름이 바뀌므로 중간 상태가 컴파일되지 않아 쪼갤 수 없다. 대신 커밋을
단계로 나눈다: ① 토큰 정의 + 대비 테스트 → ② 사용처 일괄 변환 → ③ 하드코딩 흡수 →
④ CLAUDE.md.

## 스코프 밖

- `statusColors.ts`의 `#1D9E75` (별도 색 체계)
- 다크 모드 (현재 앱에 없음)
- `fill`을 글자색에 쓰는 것을 막는 린트 규칙
