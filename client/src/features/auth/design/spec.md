# 로그인 페이지 브랜드 포인트 보강 스펙

작성 배경: `fix/login-page-design-tokens` 브랜치에서 `loginPage.styles.tsx`의 하드코딩 색상을
`colors.ts` 토큰으로 치환 완료(Container/Card/Title/ErrorMessage). 다만 원래 하드코딩 값이
토큰 값과 거의 동일해 육안상 변화가 없고, "브랜드 그린이 한 번도 안 쓰인다"는 원래 지적은
여전히 미해결. 본 스펙은 그 시각적 공백을 메우는 방안을 다룬다. **아직 구현 전 — 승인 대기.**

관련 파일(참고용):
- `client/src/features/auth/pages/loginPage.tsx`, `loginPage.styles.tsx` (수정 대상)
- `client/src/features/landing/components/landingHeader.styles.tsx`,
  `ctaButtons.styles.tsx` (브랜드 표현 방식 참고 기준)
- `client/src/styles/colors.ts` (토큰 정의)

---

## 질문 1 — 브랜드 그린을 넣어야 하는가, 무채색이 의도적으로 맞는가

**넣는 것을 권장.** 무채색 유지가 "의도된 디자인 판단"이라 보기 어려운 근거:

- 랜딩 페이지(`ctaButtons.styles.tsx`, `landingHeader.styles.tsx`)는 이미 `brand.strong`을
  주요 CTA 배경, 아웃라인 버튼, "로그인 →" 링크 텍스트에 광범위하게 쓰고 있다. 랜딩에서 로그인
  페이지로 넘어오는 흐름에서 브랜드 컬러가 완전히 사라지면, 두 화면이 같은 서비스처럼 안 느껴질
  위험이 오히려 크다.
- Google 버튼 자체의 색은 가이드라인상 고정이지만, 그 **주변**(카드 상단, 컨테이너 배경, 포커스
  상태)은 가이드라인과 무관한 우리 영역이라 브랜드를 넣을 여지가 충분하다.
- "미니멀함"과 "무채색"은 동의어가 아니다. 얇은 악센트 하나만으로도 미니멀함을 유지하면서
  브랜드감을 줄 수 있다(아래 2번 참고).

다만 **"ToDoDo" 타이틀 텍스트 자체를 브랜드색으로 바꾸는 것은 권장하지 않는다.**
`LandingHeader`의 `Logo`가 이미 `colors.text.primary`(무채색)로 고정된 패턴이고, 로그인 페이지의
`Title`은 그 워드마크와 동일한 역할(서비스명 노출)을 한다. 로그인 화면의 타이틀만 초록으로
바꾸면 "워드마크는 무채색"이라는 기존 규칙과 어긋나는 새로운 불일치가 생긴다. 브랜드 신호는
타이틀이 아니라 **장식 요소·인터랙션 요소**에 주는 쪽이 기존 언어와 맞다(토큰 정의의
`brand.strong` 용도: "글자·아이콘, 흰 글자를 얹는 솔리드 배경, **포커스 신호**",
`brand.fill` 용도: "글자를 얹지 않는 장식").

---

## 질문 2 — 구체적으로 어디에 넣을지 (랜딩 페이지 표현 방식과 일관되게)

### 화면 구조 (변경 후, 변경 지점만 표시)

```
┌─────────────────────────────┐
│                               │  ← Container bg: brand.tint (옵션, 3번)
│   ┌───────────────────────┐   │
│   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │  ← Card 상단 4px 악센트 바: brand.fill (필수, 1번)
│   │                       │   │
│   │       ToDoDo          │   │  ← Title 색상 변경 없음 (text.primary 유지)
│   │                       │   │
│   │  [ G  Google로 로그인 ] │   │  ← 색상 불변, 포커스 시에만 링 노출: brand.strong (필수, 2번)
│   │                       │   │
│   └───────────────────────┘   │
│                               │
└─────────────────────────────┘
```

### (1) [필수] Card 상단 브랜드 악센트 바

- 위치: `Card` 최상단, 카드 전체 너비, 높이 4px.
- 색상: `colors.brand.fill` (#1D9E75) — 텍스트를 얹지 않는 순수 장식이므로 토큰 정의상
  정확한 용도(글자를 얹지 않는 장식)에 해당하고, `brand.strong`보다 채도가 높아 시각적으로
  더 또렷하게 "브랜드 그린이 보인다"는 체감을 준다.
- 형태: 카드 상단 모서리(현재 `border-radius: 12px`)와 맞물리도록 위쪽만 라운드
  (`border-radius: 12px 12px 0 0`) — `shared/ui/modal/modal.styles.tsx`의 모바일 바텀시트가
  이미 동일한 `12px 12px 0 0` 패턴을 쓰고 있어 코드베이스 관례와 맞는다.
- 이유: 로그인 페이지에서 가장 확실하게 "브랜드 그린이 있다"고 체감되는 단일 지점. 카드/버튼/
  타이틀은 기존 그대로 두면서 딱 하나의 장식 요소만 추가하는 최소 개입안이라 미니멀함을 해치지
  않는다.

### (2) [필수] Google 버튼 포커스 링에 브랜드 컬러

- `GoogleButton`에 `:focus-visible { outline: 2px solid ${colors.brand.strong}; outline-offset: 2px; }` 추가.
- 현재 `GoogleButton`에 커스텀 포커스 스타일이 없어 브라우저 기본 아웃라인에 의존 중 —
  키보드 접근성 관점에서도 이미 있어야 했던 항목.
- Google 브랜딩 가이드라인은 버튼 **자체**의 배경/보더/텍스트 색을 규정하는 것이지, 버튼
  바깥에 그려지는 포커스 링(outline)까지 규정하지 않는다 — `outline`은 박스 바깥에 그려져
  버튼의 배경색·보더색을 전혀 변경하지 않으므로 가이드라인과 충돌하지 않는다.
- 토큰 정의상 `brand.strong`의 명시된 용도 중 하나가 정확히 "포커스 신호"이므로, 신규 토큰
  도입 없이 기존 역할을 그대로 쓰는 케이스다.

### (3) [선택] Container 배경을 브랜드 틴트로

- `Container`의 `background-color`를 `colors.background.secondary`(#F4F5F6, 무채색)에서
  `colors.brand.tint`(#E8F5EF, 옅은 민트)로 교체.
- 카드는 여전히 흰색이라 카드 내부 텍스트 대비에는 영향 없음. 페이지 전체 여백(배경) 톤에
  브랜드 신호를 얹는 방식으로, `랜딩 스펙`의 정보성 배너 배경(`brand.tint`)과 같은 역할
  매핑이라 일관적이다.
- **주의**: `#F4F5F6`과 `#E8F5EF`는 둘 다 매우 옅은 색이라 이 변경만 단독으로는 원래
  문제("육안으로 차이가 거의 없음")가 재발할 수 있다. (1)/(2)와 함께 적용해야 체감 효과가
  생기므로, 이 항목만 따로 채택하는 것은 권장하지 않는다.

### 채택하지 않은 대안

- **로고 아이콘 추가**: 제안하지 않음. 도도새 심볼 로고가 2026-08-18에 사용자 판단으로 전체
  폐기된 이력이 있어, 재논의하려면 그 사유부터 확인이 필요한 사안이다. 이번 스펙은 텍스트
  타이틀 구조를 그대로 두고 색상·장식만으로 해결하는 범위로 한정했다.
- **Title 텍스트 브랜드색화**: 질문 1에서 설명한 이유(LandingHeader Logo와의 일관성)로
  비권장. 만약 "로그인 화면을 랜딩과 무관한 별도 브랜드 모먼트로 취급하고 싶다"는 의도가
  있다면 유효한 대안이 될 수 있으나, 그 경우 `LandingHeader`의 `Logo` 스타일도 함께
  재검토해야 두 화면 간 새로운 불일치가 생기지 않는다 — 별도 논의 필요.

---

## 컴포넌트 설계 (변경 지점)

- 수정: `loginPage.styles.tsx`
  - `Card`: 상단 악센트 바 추가 방식은 `::before` 가상 요소 또는 `Card`를 감싸는 얇은 `AccentBar`
    자식 엘리먼트 중 택1 (구현 세부는 ui-ux-improver 재량). 어느 쪽이든 `Card`의
    `overflow: hidden`이 필요해질 수 있음(현재 없음 — 라운드 모서리 밖으로 악센트 바가
    삐져나오지 않도록 확인 필요).
  - `GoogleButton`: `:focus-visible` 규칙 추가.
  - `Container`: (선택 채택 시) `background-color` 값만 교체.
- 신규 컴포넌트 없음 — 기존 4개 styled 컴포넌트(Container/Card/Title/GoogleButton) 내
  스타일 규칙 추가/교체만으로 충분.

---

## 상태 정의 (변경 없음, 확인차 기재)

- 로딩: 별도 로딩 화면 없음(`useAuth().loading` 시 `null` 반환) — 기존 유지.
- 버튼 로딩 중: 기존처럼 텍스트만 "로그인 중..."으로 교체, `disabled` — 기존 유지.
- 에러: `ErrorMessage`(`danger.text`/`danger.background`) — 기존 유지, 변경 없음.
- 빈 상태: 해당 없음(단일 정적 화면).

---

## 디자인 토큰 요약

| 용도 | 토큰 | 비고 |
|---|---|---|
| Card 상단 악센트 바 | `colors.brand.fill` (#1D9E75) | 신규 사용 — 장식 전용, 텍스트 없음 |
| GoogleButton 포커스 링 | `colors.brand.strong` (#0F6E56) | 신규 사용 — outline만, 버튼 배경/보더 불변 |
| Container 배경 (선택) | `colors.brand.tint` (#E8F5EF) | 기존 `background.secondary` 대체 |
| Title, Card 배경, ErrorMessage | 기존 유지 | `text.primary` / `background.primary` / `danger.*` |
| 라운드 | 기존 `border-radius: 12px` 유지 | `shared/ui/modal` 등 앱 전반의 "큰 카드" 관례와 일치, 신규 토큰 불필요 |

신규 색상 토큰 불필요 — 기존 `brand.fill`/`brand.strong`/`brand.tint`를 토큰 정의된 역할
그대로 사용.

---

## 질문 3 — Google 버튼 제약 준수 확인

- `GoogleButton`의 `background-color`(#fff), `border`(#dadce0), hover(#f8f9fa),
  active(#f1f3f4), 텍스트색(#3c4043)은 **전혀 변경하지 않는다.**
- 유일한 추가는 버튼 바깥에 그려지는 `:focus-visible` outline — 버튼 자체 색상 규정과
  무관하므로 가이드라인과 충돌하지 않는다.

---

## ui-ux-improver에게 전달할 사항

1. **적용 우선순위**: (1) Card 악센트 바, (2) 포커스 링을 필수로 적용. (3) Container 틴트는
   사용자 승인 시에만 포함 — 승인 없이 단독 반영하지 말 것(체감 효과 미미해 재작업 소지 있음).
2. **접근성**:
   - `GoogleButton`의 `:focus-visible` outline은 명도 대비상 흰 배경 위에서 6.20:1을 확보하는
     `brand.strong`이라 시인성 문제 없음.
   - `GoogleIcon`(SVG)에 스크린리더 중복 안내 방지를 위해 `aria-hidden="true"` 또는
     `focusable="false"` 추가 권장 — 버튼에 이미 "Google로 로그인" 텍스트 레이블이 있으므로
     아이콘은 순수 장식으로 처리해야 함(이번 토큰 작업과 별개로 발견된 기존 갭이지만, 같은
     파일을 건드리는 김에 함께 처리 권장).
   - Card 악센트 바는 순수 장식(정보 전달 없음)이므로 `aria-hidden` 등 별도 처리 불필요.
3. **애니메이션/트랜지션**: 악센트 바는 정적 요소로 트랜지션 불필요. 포커스 링은 브라우저 기본
   전환으로 충분(별도 `transition` 불필요, 과한 모션 지양 — 기존 코드베이스 톤과 동일).
4. **회귀 확인**: `Card`에 `overflow: hidden`을 추가하는 경우 기존 `box-shadow`가 잘리지
   않는지 육안 확인 필요(그림자는 보통 카드 바깥쪽에 그려지므로 `overflow: hidden`이 있는
   요소 자체가 아니라 별도 wrapper에 그림자를 두는 구조가 필요할 수 있음 — 구현 시 주의).
