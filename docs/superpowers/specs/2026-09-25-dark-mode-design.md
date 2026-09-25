# 다크모드 (웹 + 모바일) — 설계

## Context

2026-09-20 로드맵(프리미엄 → 모바일 웹격차 → 스토어 심사)에 들어가기 전에 다크모드를 먼저 넣기로 했다. 이유는 두 가지다.

- OS를 다크로 쓰는 사용자에게 앱만 하얗게 뜨는 것은 완성도 문제다.
- 이후 로드맵(AI 플랜·결제 화면, 모바일 이식)이 전부 **새 화면을 늘리는** 작업이다. 색 공급 구조를 먼저 정리하지 않으면 하드코딩이 계속 쌓이고 다크모드 비용이 커진다.

현재 상태(2026-09-25 조사):

- 웹: `ThemeProvider`/테마 객체 없음. `client/src/styles/{colors,statusColors,urgencyColors}.ts`의 정적 상수를 67개 파일이 import. 그 밖에 51개 파일에 hex/rgba 리터럴 553곳(토큰이 있는 브랜드색조차 `#1D9E75` 63회, `#0F6E56` 38회 하드코딩). FullCalendar 오버라이드는 `index.css`/`App.css`.
- 모바일: `mobile/src/theme/colors.ts`·`statusColors.ts`가 웹 값을 **손으로 복제**. 30개 파일 import, `StyleSheet.create` 28곳, 리터럴 58곳. `app.json`의 `userInterfaceStyle: "light"` 고정.
- **복제 드리프트 발견**: 모바일 `statusColors`는 아직 PR #113 이전 값(doing=파랑 `#1d4ed8`, done=틸 `#065f46`)이다. 웹은 doing=초록 `#117453`, done=보라 `#6d28d9`로 바뀌었다. 이 설계의 단일 원본 구조가 이 문제를 구조적으로 없앤다.
- `client`·`mobile` 모두 이미 `@tododo/core`(`packages/core`)에 의존한다.
- AA 대비 테스트(`brandContrast`, `statusColorsContrast`)는 흰 배경 기준만 검증한다.

## 확정한 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 적용 범위 | 웹 + 모바일(RN) 둘 다 | 사용자 요구 |
| 전환 방식 | 시스템 / 라이트 / 다크 3택, 기본값 시스템 | 표준 패턴. 시스템만 따르면 "OS 라이트·앱만 다크"가 불가 |
| 선택값 저장 | 기기별(웹 localStorage, 앱 AsyncStorage). 기기 간 동기화 안 함 | 테마는 기기 환경(사무실 PC·밤의 폰)에 따라 다르게 쓰는 경우가 많다. rules/데이터 모델 추가 불필요 |
| 다크 바탕 톤 | 뉴트럴 그레이 + 층 간 명도차(elevation) | 직접 경쟁 앱(Todoist·TickTick·Things)과 iOS 시스템 다크가 뉴트럴. 무채색 위에서 상태색(초록/보라) 구분이 가장 또렷 |
| 다크 브랜드 버튼 | 밝은 초록 바탕 + 거의 검정 글자(반전) | 어두운 바탕에서 진한 초록은 묻힌다 |
| 팔레트 원본 | `packages/core/src/theme/` 단일 원본 | 수동 복제 드리프트 제거, 두 테마 AA를 한 곳에서 검증 |
| 웹 전달 | CSS 변수(`var(--…)`) | 기존 토큰 사용처 515곳 무수정, 전환 시 리렌더 없음, 전역 CSS(FullCalendar)까지 한 방식 |
| 앱 전달 | `ThemeProvider` + `useTheme` + `makeStyles` | RN에는 CSS 변수가 없음 |
| 웹 토글 위치 | Header·MobileHeader 우측(아바타 왼쪽) 아이콘 + 3택 드롭다운 | 사이드바 접힘/모바일 웹과 무관하게 항상 같은 자리. SNB 하단은 눈에 안 띄고, SNB 상단은 상태별 3가지 형태가 필요 |
| 앱 토글 위치 | 3개 탭 루트 화면 헤더 우측 아이콘 → `Alert.alert` 3택 | 웹과 같은 자리, 기존 모바일 관례(TodoListScreen) 재사용 |
| 라이트 미세 변화 | 허용 | 토큰 없는 하드코딩 회색을 가장 가까운 기존 토큰으로 흡수 |
| 프리미엄 여부 | 무료 | 다크모드는 기본 기능 인식, 유료화 시 반감 |

## 1. 토큰 모델과 core 팔레트

```
packages/core/src/theme/
  tokens.ts     ThemeTokens 타입 — light/dark가 같은 모양임을 타입으로 강제
  light.ts      현재 client/styles 값 그대로 이관
  dark.ts       아래 표의 값
  contrast.ts   relativeLuminance / contrast 순수 함수 (client 테스트의 helper 승격)
  resolveScheme.ts  (preference, osScheme) → "light" | "dark"
  index.ts
```

기존 이름을 유지하고, 다크에서 라이트와 다르게 동작해야 하는데 담을 토큰이 없는 곳에만 신규 토큰을 둔다. 신규는 `brand.onStrong`, `surface.raised`, `surface.overlay`, `scrim` 4개뿐이다.

### 팔레트 값

| 토큰 | light | dark | 용도 |
|---|---|---|---|
| `brand.strong` | `#0F6E56` | `#3CCB9A` | 글자·아이콘, 솔리드 버튼 배경, 포커스 |
| `brand.strongHover` | `#0A4E3C` | `#5DD8AE` | strong 요소 hover/pressed |
| `brand.fill` | `#1D9E75` | `#2FB386` | 글자 없는 장식 |
| `brand.tint` | `#E8F5EF` | `#16352B` | 활성 내비·배지 연한 배경 |
| `brand.onStrong` 🆕 | `#FFFFFF` | `#06231A` | strong 배경 위 글자 |
| `background.primary` | `#FFFFFF` | `#121212` | 앱 바탕 |
| `background.secondary` | `#F4F5F6` | `#181818` | 사이드바·보조 영역 |
| `surface.raised` 🆕 | `#FFFFFF` | `#1E1E1E` | 카드·패널 |
| `surface.overlay` 🆕 | `#FFFFFF` | `#262626` | 모달·바텀시트·드롭다운 |
| `text.primary` | `#1A1A1A` | `#E8EAED` | 본문 |
| `text.secondary` | `#5F6368` | `#A8ADB3` | 보조 |
| `text.tertiary` | `#9AA0A6` | `#7C8187` | 플레이스홀더·비활성 |
| `border.secondary` | `#D1D5DB` | `#3A3A3A` | |
| `border.tertiary` | `#E5E7EB` | `#2C2C2C` | |
| `border.danger` | `#E24B4A` | `#FF7A78` | |
| `danger.main` | `#E24B4A` | `#FF7A78` | |
| `danger.subtle` | `#F5C2C1` | `#5C2B2B` | |
| `danger.background` | `#FBEAEA` | `#3A1C1C` | |
| `danger.text` | `#C53A39` | `#FF8E8C` | |
| `status.todo.{main,light,border}` | `#4b5563` `#f3f4f6` `#9ca3af` | `#C4C9D0` `#2A2D31` `#5B6168` | |
| `status.doing.{main,light,border}` | `#117453` `#e5faf3` `#5ae2b5` | `#4FD1A5` `#123A2E` `#2A8F6D` | |
| `status.done.{main,light,border}` | `#6d28d9` `#ede9fe` `#a78bfa` | `#B79CFF` `#2A2145` `#7C5FD6` | |
| `urgency.soon.{main,background,text}` | `#F97316` `#FFEDD5` `#C2410C` | `#FB923C` `#3A2412` `#FDBA74` | |
| `urgency.danger.*` | = `danger.*` | = `danger.*` | |
| `scrim` 🆕 | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.6)` | 모달 뒤 덮개 |

다크 대비 실측(2026-09-25): 본문/바탕 15.5, 보조/카드 7.4, 보조/오버레이 6.7, `brand.strong`/카드 8.1, `brand.strong`/`tint` 6.5, `onStrong`/`strong` 8.1, `danger.text`/`danger.background` 7.0, 상태 main/light 6.6~8.3, `urgency.soon.text`/background 8.6. 전부 AA 텍스트(4.5) 이상.

### AA 테스트

`client/src/styles/__tests__/{brandContrast,statusColorsContrast}.test.ts`를 core로 옮기고, **같은 케이스를 `light`와 `dark` 각각에 대해** 실행한다(`describe.each`). "흰 배경" 같은 고정 상수는 해당 테마의 `background.primary`/`surface.raised`로 바꾼다. 기존 테스트의 판정 기준(어떤 쌍을 텍스트 4.5 / 비텍스트 3으로 보는지)은 그대로 유지한다.

## 2. 웹 전달 구조

### CSS 변수

- core 팔레트에서 CSS를 생성한다: `:root { --brand-strong: #0F6E56; … }`, `:root[data-theme="dark"] { … }`. 변수명은 토큰 경로를 kebab-case로(`status.doing.main` → `--status-doing-main`).
- 생성 방식: Vite 플러그인의 virtual CSS 모듈(`virtual:theme.css`)을 `main.tsx`에서 import. 빌드 산출 CSS에 포함되므로 첫 페인트 전에 존재한다.
- `:root { color-scheme: light; }` / `[data-theme="dark"] { color-scheme: dark; }` — 네이티브 `<select>`(통계 필터)·스크롤바·date input이 OS 다크 스타일을 따른다.
- `client/src/styles/colors.ts`·`statusColors.ts`·`urgencyColors.ts`는 **같은 모양의 객체**를 export하되 값이 `"var(--…)"` 문자열이다. core 토큰 경로에서 자동 생성(`toCssVarRefs(light)`)하므로 오타가 없다. 기존 import와 `getStatusColor` 시그니처는 그대로다.

### 테마 결정 흐름

```
localStorage["tododo:theme"] = "system" | "light" | "dark"   (없거나 읽기 실패 → system)
        │
index.html <head> 인라인 스크립트 (첫 페인트 전)
  → system이면 matchMedia("(prefers-color-scheme: dark)")
  → <html data-theme="light|dark">, <meta name="theme-color"> 갱신
        │
ThemePreferenceProvider (React)
  → preference 상태 + setPreference(): localStorage 저장(try/catch) + data-theme 갱신
  → preference === "system"일 때 matchMedia change 구독 → OS 전환 즉시 반영
```

인라인 스크립트가 필요한 이유: React 마운트 후 적용하면 새로고침마다 흰 화면이 한 번 번쩍인다. 인라인 스크립트의 판정 로직은 `resolveScheme`과 같은 규칙이며, 둘이 어긋나지 않도록 테스트에서 같은 케이스 표로 검증한다.

### 특수 처리

- **SVG 차트** (`features/insights/components/charts/*` 9곳): `fill={colors.x}` 프레젠테이션 속성은 `var()` 지원이 브라우저마다 불확실하므로 `style={{ fill: … }}` / `style={{ stroke: … }}`로 바꾼다.
- **FullCalendar**: `index.css`/`App.css`의 FC 오버라이드 리터럴을 변수로 바꾸고, FC 자체 변수(`--fc-border-color`, `--fc-page-bg-color`, `--fc-neutral-bg-color`, `--fc-today-bg-color` 등)를 우리 변수에 연결한다.
- **그림자**: 기존 `box-shadow`는 유지. 다크의 층 구분은 `surface.*` 명도차가 담당한다.
- **랜딩/로그인**: 토글은 없지만 저장된 선택값/system을 그대로 따른다.

### 선택 UI — `ThemeMenu`

- `client/src/layouts/themeMenu/`에 신규. 데스크톱 `Header`의 사용자 정보 왼쪽, `MobileHeader`의 아바타 왼쪽에 같은 컴포넌트를 둔다.
- 아이콘 버튼(lucide `Sun` / `Monitor` / `Moon` — 현재 preference 표시) → 드롭다운 3항목(라이트 / 시스템 / 다크), 현재 항목 체크 표시.
- 접근성: 버튼 `aria-label="화면 테마: {현재}"`, `aria-haspopup="menu"`, 항목은 `role="menuitemradio"` + `aria-checked`, Esc·바깥 클릭으로 닫힘, 키보드 ↑↓ 이동.
- SNB·ProfileMenu는 변경하지 않는다.

## 3. 모바일(RN) 전달 구조

### ThemeProvider

```
AsyncStorage["tododo:theme"] = "system" | "light" | "dark"
        │
ThemeProvider (App 루트, NavigationContainer 바깥)
  → useColorScheme()(OS) + preference → resolveScheme → "light" | "dark"
  → Appearance.setColorScheme(preference === "system" ? null : preference)
  → context: { tokens, scheme, preference, setPreference }
```

- `Appearance.setColorScheme`: 우리 화면만 바꾸면 OS가 그리는 `Alert.alert`·키보드·피커가 라이트로 남는다. 앱 단위 설정을 OS에 알려 이것들까지 맞춘다.
- 저장값 로드 전(수 ms)에는 `ThemeProvider`가 `null`을 렌더한다. `expo-splash-screen`은 미설치이고 네이티브 재빌드가 필요해 도입하지 않는다 — `userInterfaceStyle: automatic`이면 그 순간 보이는 네이티브 창 배경이 OS 설정을 따르므로, 틀린 테마로 한 프레임 그려지는 것보다 낫다. 로드 실패 시 system.
- `app.json` `userInterfaceStyle: "automatic"` — iOS/안드로이드가 OS 다크 신호를 앱에 전달하려면 필수.
- `mobile/src/theme/colors.ts`·`statusColors.ts`는 삭제하고 core를 import한다(드리프트 해소).

### 스타일 패턴

```ts
// 현재
const styles = StyleSheet.create({ title: { color: colors.text.primary } });

// 변경
const useStyles = makeStyles((t) => ({ title: { color: t.text.primary } }));
// 컴포넌트 안: const styles = useStyles();
```

`makeStyles`는 토큰 객체(light/dark 두 개뿐)를 키로 `WeakMap` 캐시한다 — 같은 테마에서는 `StyleSheet.create`를 다시 호출하지 않는다.

### 서드파티

- React Navigation: `NavigationContainer theme`에 우리 토큰으로 만든 `Theme`(background/card/text/border/primary) 전달 → 헤더·탭바·화면 배경.
- `react-native-calendars`: `theme` prop이 마운트 시에만 반영되므로 `key={scheme}`로 재마운트.
- `expo-status-bar`: `style={scheme === "dark" ? "light" : "dark"}`.

### 선택 UI

Today / TodoList / Calendar 루트 화면의 `headerRight`에 테마 아이콘 → `Alert.alert("화면 테마", …, [라이트, 시스템, 다크, 취소])`. 현재 선택은 버튼 라벨에 "✓"로 표시.

앱 설정 화면·로그아웃은 현재 없으며, 스토어 심사(Task 8)의 계정 삭제 요구와 함께 다룬다 — 이 스펙 범위 밖.

## 4. 하드코딩 정리 · 출시 순서 · 테스트

### 리터럴 치환 규칙

1. 토큰과 값이 같은 리터럴 → 해당 토큰.
2. 토큰에 없는 회색(`#e0e0e0`, `#f0f0f0`, `#666`, `#f1f3f4` …) → 명도가 가장 가까운 기존 토큰(`border.*`, `background.secondary`, `text.*`)으로 흡수.
3. `#fff`/`white` → 쓰임에 따라 `surface.raised`/`surface.overlay`/`background.primary`(배경) 또는 `brand.onStrong`(브랜드 배경 위 글자).
4. 오버레이용 `rgba(0,0,0,x)` → `scrim`. 그림자 안의 rgba는 유지.
5. 규칙으로 판단이 안 서는 값은 PR 설명에 목록으로 남기고 가장 가까운 토큰을 쓴다(신규 토큰은 만들지 않는다).

**재발 방지**: 웹·앱 ESLint에 `no-restricted-syntax`로 문자열/템플릿 리터럴 안의 `#hex`·`rgb(`·`rgba(` 패턴을 에러 처리. 예외 경로: `client/src/styles/**`, `packages/core/src/theme/**`, 테스트 파일, 그림자(`box-shadow`/`shadowColor`)는 인라인 disable 주석으로 사유 명시.

### 출시 순서

| PR | 내용 | 사용자 체감 |
|---|---|---|
| 1 | core `theme/` + 두 테마 AA 테스트 + `resolveScheme` | 없음 |
| 2 | 웹 CSS 변수 인프라 + 리터럴 정리 + ESLint 규칙. **data-theme은 light 고정** | 회색 미세 조정 |
| 3 | 웹 `ThemePreferenceProvider` + 인라인 스크립트 + `ThemeMenu` | **웹 다크모드 출시** |
| 4 | 앱 core 팔레트 전환 + `ThemeProvider`/`makeStyles` + 리터럴 정리 + ESLint. **light 고정** | 상태색 드리프트 해소(모바일 doing/done이 웹과 같아짐) |
| 5 | 앱 헤더 토글 + `Appearance` 연동 + `userInterfaceStyle: automatic` | **앱 다크모드 출시** |

light 고정 단계를 두는 이유: 정리가 덜 된 상태에서 system 추종을 켜면 OS 다크 사용자에게 흰 조각이 섞인 화면이 즉시 노출된다. 인프라 PR과 스위치 PR을 분리해 PR 2·4를 화면 변화 없이 머지한다.

### 테스트

- **core**: 대비 테스트 light×dark, `resolveScheme` 전 조합(3 preference × 2 os), `toCssVarRefs`가 모든 토큰 경로를 `var(--…)`로 내보내는지.
- **웹**: `ThemePreferenceProvider`(localStorage 없음/throw → system, setPreference 저장·data-theme 반영, system일 때 matchMedia change 반영), 인라인 스크립트 판정 표 = `resolveScheme` 표, `ThemeMenu`(열기/선택/Esc/aria-checked).
- **앱**: `makeStyles` 캐시(같은 토큰 → 같은 객체), `ThemeProvider`(AsyncStorage 실패 → system, `Appearance.setColorScheme` 호출값).
- **육안 검증**: 웹은 Playwright로 오늘/목록/캘린더/칸반/인사이트 + 할 일 모달·바텀시트·ThemeMenu 드롭다운을 light/dark 스크린샷해 흰 조각 잔존 확인. 앱은 iOS 시뮬레이터에서 3탭 + 상세/폼 + Alert를 다크로 확인.

## 범위 밖

- 기기 간 테마 동기화
- 앱 설정 화면(스토어 심사 Task 8에서)
- 사용자 지정 테마 색·고대비 테마
- 프리미엄 게이팅
