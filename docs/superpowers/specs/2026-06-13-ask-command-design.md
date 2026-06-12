# /ask 슬래시 커맨드 설계

**날짜**: 2026-06-13  
**상태**: 승인됨

## 개요

사용자가 `/ask <프롬프트>` 입력 시 `agent-manager` 서브에이전트가 프롬프트를 분석하고 적합한 전문 에이전트에 자동으로 위임하는 Claude Code 슬래시 커맨드.

## 목표

- 에이전트 이름을 몰라도 자연어로 요청 가능
- `/ask`가 진입점, 라우팅 판단은 `agent-manager`가 전담
- 복합 요청 시 병렬/순차 실행 자동 결정

## 파일 구조

```
.claude/
├── agents/
│   ├── agent-manager.md     (기존 유지 - 라우팅 로직 보유)
│   ├── code-reviewer.md
│   ├── improvement-finder.md
│   ├── notion-recorder.md
│   ├── schedule-manager.md
│   ├── test-specialist.md
│   └── ui-ux-improver.md
└── commands/
    └── ask.md               (신규 추가)
```

## 실행 흐름

```
사용자: /ask 개선점을 확인해줘
    ↓
ask.md 커맨드 로드
    ↓
agent-manager 서브에이전트 호출 (프롬프트 전달)
    ↓
agent-manager: 라우팅 분석 → "개선점" 신호 감지
    ↓
→ `improvement-finder`에 위임합니다: 개선점 탐색 요청
    ↓
improvement-finder 실행
    ↓
결과 보고
```

## ask.md 커맨드 명세

`.claude/commands/ask.md`는 다음을 수행하도록 Claude에 지시:

1. 사용자 프롬프트를 `agent-manager` 서브에이전트에 전달
2. agent-manager가 라우팅·실행·결과 취합을 모두 담당
3. `/ask` 커맨드 자체는 로직 없이 agent-manager를 호출하는 얇은 래퍼

## 라우팅 규칙 (agent-manager 담당)

| 신호 | 에이전트 |
|---|---|
| 코드 리뷰, PR, 컨벤션 | `code-reviewer` |
| 일정, 우선순위, 스프린트 | `schedule-manager` |
| 테스트, 커버리지, E2E | `test-specialist` |
| 기록, 문서화, Notion | `notion-recorder` |
| 개선점, 기술 부채, 전체 스캔 | `improvement-finder` |
| UI/UX, 디자인, 접근성, 반응형 | `ui-ux-improver` |
| 매칭 없음 | 사용자에게 의도 재확인 |

### 복합 요청 처리

- **독립적 작업** (예: "테스트 작성 + UI 점검") → 병렬 실행
- **순서 의존** (예: "테스트 작성 + Notion 기록") → 순차 실행

## 사용 예시

```
/ask 개선점 찾아줘
→ improvement-finder 실행

/ask 현재 PR 코드 리뷰해줘
→ code-reviewer 실행

/ask 테스트 작성하고 결과 Notion에 기록해줘
→ test-specialist 실행 후 notion-recorder 순차 실행

/ask UI 점검하고 개선점도 찾아줘
→ ui-ux-improver + improvement-finder 병렬 실행
```

## 구현 범위

- `.claude/commands/ask.md` 파일 1개 추가
- 기존 에이전트 파일 수정 없음
