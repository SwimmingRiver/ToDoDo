# 고객 의견 수집 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 사용자가 웹 클라이언트 헤더/모바일 드로어에서 자유 형식 텍스트 피드백을 제출하면 Firestore `feedback` 컬렉션에 저장되는 기능을 만든다.

**Architecture:** `client/CLAUDE.md`의 `api/ → hooks/ → components/` 의존 순서를 따르는 새 피처 `src/features/feedback/`를 신설한다. 저장은 Firestore 전용(Notion 등 외부 동기화는 범위 밖). UI는 버튼+모달을 캡슐화한 자기완결형 컴포넌트로 만들어 헤더(PC)와 모바일 드로어 양쪽에 상태를 끌어올리지 않고 그대로 재사용한다.

**Tech Stack:** React, TypeScript, styled-components, TanStack Query(`useMutation`), Firebase(Auth + Firestore), Vitest + React Testing Library, Sentry(`@sentry/react`).

**Spec:** `docs/superpowers/specs/2026-08-27-feedback-collection-design.md`

## Global Constraints

- 저장 필드: `userId`(string), `email`(string), `content`(string, trim 후 1~1000자), `createdAt`(string, `new Date().toISOString()` — 이 코드베이스는 `serverTimestamp()`가 아니라 클라이언트 ISO 문자열을 쓴다. `todoApi.ts`의 `createTodo`가 그 예).
- `feedback` 컬렉션은 클라이언트에서 `create`만 허용, `read/update/delete`는 전부 금지(`allow ...: if false`). 열람은 Firebase 콘솔(Admin 권한, 규칙 우회)로 한다.
- 글자수 상한은 클라이언트 상수(`FEEDBACK_CONTENT_MAX_LENGTH = 1000`)와 `firestore.rules`의 하드코딩 값이 반드시 같은 숫자여야 한다(`descriptionValid()` 패턴과 동일한 이유).
- 파일명은 camelCase.tsx (`client/CLAUDE.md`).
- 브랜드 색은 역할 토큰(`colors.brand.strong` 등)으로 참조하고 하드코딩 hex를 새로 만들지 않는다.
- 설정 페이지는 만들지 않는다(YAGNI, 스펙에서 확정).

---

## Task 1: `feedback` 컬렉션 보안 규칙 추가

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: 없음 (최상위 규칙 파일)
- Produces: `feedback` 컬렉션에 대한 `create`-only 규칙. 이후 태스크의 `feedbackApi.ts`가 이 규칙을 통과해야 하는 문서 형태(`userId`, `email`, `content`)를 그대로 쓴다.

이 저장소에는 `firestore.rules` 전용 유닛테스트 스위트가 없다(`todos` 규칙도 마찬가지 — 스펙에서 확인됨). 이 태스크는 TDD 없이 파일만 수정한다.

- [ ] **Step 1: `firestore.rules`에 `feedback` 매치 블록 추가**

`firestore.rules`의 `match /todos/{todoId} { ... }` 블록 바로 다음(같은 `match /databases/{database}/documents { ... }` 안, 닫는 중괄호 전)에 아래를 추가한다:

```
    match /feedback/{feedbackId} {
      // 상한 1000은 클라이언트의 FEEDBACK_CONTENT_MAX_LENGTH
      // (features/feedback/api/feedbackApi.ts)와 같은 값이어야 한다.
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

- [ ] **Step 2: 파일 문법 확인**

전역 `firebase` CLI가 이미 설치되어 있다(`firebase --version`). 프로젝트 연결 없이 규칙 파일 하나만 정적 파싱하는 명령을 쓴다.

Run: `firebase firestore:rules:list --project tododo-83576 >/dev/null 2>&1; firebase deploy --only firestore:rules --dry-run --project tododo-83576 2>&1 | tail -20 || true`

로그인이 안 돼 있어 인증 에러로 실패해도 괜찮다(권한 문제로 실패하는 것과 문법 오류로 실패하는 것은 에러 메시지로 구분된다 — `Invalid rules` 류의 문법 에러만 아니면 통과로 간주). 실제 배포는 이번 태스크 범위가 아니다.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: feedback 컬렉션 보안 규칙 추가"
```

---

## Task 2: `feedbackApi.ts` — Firestore 쓰기 함수

**Files:**
- Create: `client/src/features/feedback/api/feedbackApi.ts`
- Create: `client/src/features/feedback/api/index.ts`
- Create: `client/src/features/feedback/api/__tests__/feedbackApi.test.ts`

**Interfaces:**
- Consumes: `auth`(`@/shared/lib/firebase`), `db`(`@/shared/lib/firestore`), `addDoc`/`collection`(`firebase/firestore`), `Sentry`(`@sentry/react`) — 전부 `todoApi.ts`가 이미 쓰는 것과 동일한 모듈.
- Produces:
  - `export const FEEDBACK_CONTENT_MAX_LENGTH = 1000`
  - `export const submitFeedback: (content: string) => Promise<void>` — 미인증 시 `Error("Not authenticated")` throw. 빈 내용(trim 후 0자) 시 `Error("피드백 내용을 입력해주세요")` throw. 이 두 함수/상수는 Task 3의 `useSubmitFeedback`이 그대로 import해서 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/feedback/api/__tests__/feedbackApi.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/shared/lib/firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-id', email: 'user@example.com' },
  },
  googleProvider: {},
}))

vi.mock('@/shared/lib/firestore', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
}))

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}))

describe('feedbackApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('submitFeedback', () => {
    it('인증된 사용자의 uid/email과 trim된 content, ISO createdAt을 저장해야 한다', async () => {
      const { addDoc } = await import('firebase/firestore')
      const { submitFeedback } = await import('../feedbackApi')

      await submitFeedback('  좋아요  ')

      expect(addDoc).toHaveBeenCalledTimes(1)
      const [, payload] = vi.mocked(addDoc).mock.calls[0]
      expect(payload).toMatchObject({
        userId: 'test-user-id',
        email: 'user@example.com',
        content: '좋아요',
      })
      expect(typeof (payload as { createdAt: string }).createdAt).toBe('string')
    })

    it('빈 문자열(공백만)이면 Firestore를 호출하지 않고 에러를 던져야 한다', async () => {
      const { addDoc } = await import('firebase/firestore')
      const { submitFeedback } = await import('../feedbackApi')

      await expect(submitFeedback('   ')).rejects.toThrow()
      expect(addDoc).not.toHaveBeenCalled()
    })

    it('미인증 상태면 에러를 던져야 한다', async () => {
      // todoApi.test.ts와 동일한 관례: Object.defineProperty로 currentUser를 바꾼다
      const { auth } = await import('@/shared/lib/firebase')
      Object.defineProperty(auth, 'currentUser', { value: null, configurable: true })

      const { submitFeedback } = await import('../feedbackApi')

      await expect(submitFeedback('의견입니다')).rejects.toThrow('Not authenticated')

      // 이후 테스트에 영향 주지 않도록 원복
      Object.defineProperty(auth, 'currentUser', {
        value: { uid: 'test-user-id', email: 'user@example.com' },
        configurable: true,
      })
    })

    it('addDoc이 실패하면 Sentry로 캡처하고 에러를 다시 던져야 한다', async () => {
      const { addDoc } = await import('firebase/firestore')
      const Sentry = await import('@sentry/react')
      const { submitFeedback } = await import('../feedbackApi')

      const error = new Error('network down')
      vi.mocked(addDoc).mockRejectedValueOnce(error)

      await expect(submitFeedback('의견입니다')).rejects.toThrow('network down')
      expect(Sentry.captureException).toHaveBeenCalledWith(
        error,
        { tags: { feature: 'feedback' } },
      )
    })
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd client && npx vitest run src/features/feedback/api/__tests__/feedbackApi.test.ts`
Expected: FAIL — `../feedbackApi` 모듈이 없어서 import 에러.

- [ ] **Step 3: 최소 구현 작성**

`client/src/features/feedback/api/feedbackApi.ts`:

```ts
import { addDoc, collection } from "firebase/firestore";
import * as Sentry from "@sentry/react";
import { auth } from "@/shared/lib/firebase";
import { db } from "@/shared/lib/firestore";

export const FEEDBACK_CONTENT_MAX_LENGTH = 1000;

const feedbackRef = collection(db, "feedback");

export const submitFeedback = async (content: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const trimmed = content.trim();
  if (!trimmed) throw new Error("피드백 내용을 입력해주세요");

  try {
    await addDoc(feedbackRef, {
      userId: user.uid,
      email: user.email,
      content: trimmed,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { feature: "feedback" } });
    throw error;
  }
};
```

`client/src/features/feedback/api/index.ts`:

```ts
export * from "./feedbackApi";
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd client && npx vitest run src/features/feedback/api/__tests__/feedbackApi.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/features/feedback/api
git commit -m "feat: feedbackApi.submitFeedback 추가"
```

---

## Task 3: `useSubmitFeedback` 훅

**Files:**
- Create: `client/src/features/feedback/hooks/useSubmitFeedback.ts`
- Create: `client/src/features/feedback/hooks/index.ts`
- Create: `client/src/features/feedback/hooks/__tests__/useSubmitFeedback.test.tsx`

**Interfaces:**
- Consumes: `submitFeedback`(Task 2, `../api`)
- Produces: `export const useSubmitFeedback: () => UseMutationResult<void, Error, string>` — `useCreateTodo.ts`와 동일하게 TanStack Query의 mutation 객체를 그대로 반환한다(래핑하지 않음). Task 4의 `feedbackButton.tsx`가 `mutate`, `isPending`, `isSuccess`, `isError`, `reset`을 그대로 구조분해해서 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/feedback/hooks/__tests__/useSubmitFeedback.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSubmitFeedback } from '../useSubmitFeedback'

vi.mock('../../api', () => ({ submitFeedback: vi.fn() }))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

describe('useSubmitFeedback 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mutate가 정의되어 있어야 한다', () => {
    const { result } = renderHook(() => useSubmitFeedback(), { wrapper: createWrapper() })
    expect(typeof result.current.mutate).toBe('function')
  })

  it('mutate 호출 시 submitFeedback을 content와 함께 호출하고 성공 상태가 되어야 한다', async () => {
    const { submitFeedback } = await import('../../api')
    vi.mocked(submitFeedback).mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useSubmitFeedback(), { wrapper: createWrapper() })

    result.current.mutate('좋은 앱이에요')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(vi.mocked(submitFeedback)).toHaveBeenCalledWith('좋은 앱이에요')
  })

  it('submitFeedback이 실패하면 isError가 true가 되어야 한다', async () => {
    const { submitFeedback } = await import('../../api')
    vi.mocked(submitFeedback).mockRejectedValueOnce(new Error('network down'))

    const { result } = renderHook(() => useSubmitFeedback(), { wrapper: createWrapper() })

    result.current.mutate('실패 케이스')

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd client && npx vitest run src/features/feedback/hooks/__tests__/useSubmitFeedback.test.tsx`
Expected: FAIL — `../useSubmitFeedback` 모듈 없음.

- [ ] **Step 3: 최소 구현 작성**

`client/src/features/feedback/hooks/useSubmitFeedback.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import { submitFeedback } from "../api";

export const useSubmitFeedback = () => {
  return useMutation({
    mutationFn: (content: string) => submitFeedback(content),
  });
};
```

`client/src/features/feedback/hooks/index.ts`:

```ts
export { useSubmitFeedback } from "./useSubmitFeedback";
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd client && npx vitest run src/features/feedback/hooks/__tests__/useSubmitFeedback.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/features/feedback/hooks
git commit -m "feat: useSubmitFeedback 훅 추가"
```

---

## Task 4: `FeedbackButton` 컴포넌트 (버튼 + 모달 자기완결형)

**Files:**
- Create: `client/src/features/feedback/components/feedbackButton.tsx`
- Create: `client/src/features/feedback/components/feedbackButton.styles.tsx`
- Create: `client/src/features/feedback/components/__tests__/feedbackButton.test.tsx`

**Interfaces:**
- Consumes: `useModal`(`@/shared/hooks/useModal`), `useSubmitFeedback`(Task 3, `../hooks`), `FEEDBACK_CONTENT_MAX_LENGTH`(Task 2, `../api`)
- Produces: `export default FeedbackButton: () => JSX.Element` — props 없음. Task 5에서 `<FeedbackButton />`을 헤더/드로어에 그대로 배치한다.

컴포넌트 테스트는 `todoListItem.test.tsx`의 관례를 따라 훅 모듈(`../hooks`)을 mock해서 mutation 상태를 직접 제어한다 (react-query 실제 동작은 Task 3에서 이미 검증했으므로 여기서는 UI 상태 전환만 본다).

- [ ] **Step 1: 실패하는 테스트 작성**

`client/src/features/feedback/components/__tests__/feedbackButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeedbackButton from '../feedbackButton'

// vi.mock 팩토리는 이 파일의 다른 import보다 먼저(모듈 로드 시점에) 실행되므로,
// 나중에 선언되는 일반 let 변수를 참조하면 TDZ 에러가 난다. todoListItem.test.tsx가
// navigateSpy에 쓰는 것과 같은 관례로 vi.hoisted에 담아 참조 시점 문제를 피한다.
const { mutate, reset, mutationState } = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  mutationState: { isPending: false, isSuccess: false, isError: false },
}))

vi.mock('../../hooks', () => ({
  useSubmitFeedback: () => ({
    mutate,
    reset,
    get isPending() { return mutationState.isPending },
    get isSuccess() { return mutationState.isSuccess },
    get isError() { return mutationState.isError },
  }),
}))

describe('FeedbackButton 컴포넌트', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mutationState.isPending = false
    mutationState.isSuccess = false
    mutationState.isError = false
  })

  it('트리거 버튼만 보이고 모달은 닫혀 있어야 한다', () => {
    render(<FeedbackButton />)

    expect(screen.getByRole('button', { name: '의견 보내기' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('자유롭게 의견을 남겨주세요')).not.toBeInTheDocument()
  })

  it('트리거 버튼을 클릭하면 모달이 열리고 제출 버튼은 비어있는 동안 비활성화된다', async () => {
    const user = userEvent.setup()
    render(<FeedbackButton />)

    await user.click(screen.getByRole('button', { name: '의견 보내기' }))

    expect(screen.getByPlaceholderText('자유롭게 의견을 남겨주세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('내용을 입력하면 제출 버튼이 활성화되고, 클릭하면 mutate가 호출된다', async () => {
    const user = userEvent.setup()
    render(<FeedbackButton />)

    await user.click(screen.getByRole('button', { name: '의견 보내기' }))
    await user.type(screen.getByPlaceholderText('자유롭게 의견을 남겨주세요'), '좋아요')

    const submitButton = screen.getByRole('button', { name: '제출' })
    expect(submitButton).not.toBeDisabled()

    await user.click(submitButton)

    expect(mutate).toHaveBeenCalledWith('좋아요', expect.anything())
  })

  it('isSuccess가 true면 성공 메시지를 보여준다', async () => {
    mutationState.isSuccess = true
    const user = userEvent.setup()
    render(<FeedbackButton />)

    await user.click(screen.getByRole('button', { name: '의견 보내기' }))

    expect(screen.getByText('감사합니다! 의견이 전달되었습니다.')).toBeInTheDocument()
  })

  it('isError가 true면 에러 메시지를 보여준다', async () => {
    mutationState.isError = true
    const user = userEvent.setup()
    render(<FeedbackButton />)

    await user.click(screen.getByRole('button', { name: '의견 보내기' }))

    expect(screen.getByText('전송에 실패했습니다. 잠시 후 다시 시도해주세요.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd client && npx vitest run src/features/feedback/components/__tests__/feedbackButton.test.tsx`
Expected: FAIL — `../feedbackButton` 모듈 없음.

- [ ] **Step 3: 스타일 파일 작성**

`client/src/features/feedback/components/feedbackButton.styles.tsx`:

```tsx
import { styled, keyframes } from "styled-components";
import { media } from "@/styles/breakpoints";
import { colors } from "@/styles/colors";

const fadeIn = keyframes`from { opacity: 0; } to { opacity: 1; }`;
const scaleIn = keyframes`
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
`;

export const TriggerButton = styled.button`
  font-size: 13px;
  background: none;
  border: none;
  color: ${colors.text.secondary};
  cursor: pointer;
  padding: 0;

  &:hover {
    color: ${colors.brand.strong};
  }
`;

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  animation: ${fadeIn} 0.2s ease-out;
`;

export const Container = styled.div`
  background-color: ${colors.background.primary};
  border-radius: 12px;
  padding: 24px;
  width: 400px;
  max-width: calc(100% - 32px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  animation: ${scaleIn} 0.2s ease-out;
  display: flex;
  flex-direction: column;
  gap: 8px;

  ${media.mobile} {
    width: calc(100% - 32px);
  }
`;

export const Title = styled.h3`
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: ${colors.text.primary};
`;

export const Textarea = styled.textarea`
  width: 100%;
  min-height: 120px;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  border: 1px solid ${colors.border.secondary};
  border-radius: 8px;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: ${colors.brand.strong};
  }

  &:disabled {
    background-color: ${colors.background.secondary};
    cursor: not-allowed;
  }
`;

export const CharCount = styled.span`
  align-self: flex-end;
  font-size: 12px;
  color: ${colors.text.tertiary};
`;

export const ErrorMessage = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.danger.text};
`;

export const SuccessMessage = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${colors.brand.strong};
`;

export const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
`;

export const Button = styled.button<{ $variant?: "primary" }>`
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  ${({ $variant }) =>
    $variant === "primary"
      ? `
    background-color: ${colors.brand.strong};
    color: white;
    border: none;

    &:hover {
      background-color: ${colors.brand.strongHover};
    }
  `
      : `
    background-color: white;
    color: ${colors.text.secondary};
    border: 1px solid ${colors.border.secondary};

    &:hover {
      background-color: ${colors.background.secondary};
    }
  `}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
```

- [ ] **Step 4: 컴포넌트 최소 구현 작성**

`client/src/features/feedback/components/feedbackButton.tsx`:

```tsx
import { useState } from "react";
import useModal from "@/shared/hooks/useModal";
import { useSubmitFeedback } from "../hooks";
import { FEEDBACK_CONTENT_MAX_LENGTH } from "../api";
import {
  TriggerButton,
  Overlay,
  Container,
  Title,
  Textarea,
  CharCount,
  ErrorMessage,
  SuccessMessage,
  ButtonGroup,
  Button,
} from "./feedbackButton.styles";

const FeedbackButton = () => {
  const { isOpen, setIsOpen } = useModal();
  const [content, setContent] = useState("");
  const { mutate, isPending, isSuccess, isError, reset } = useSubmitFeedback();

  const handleClose = () => {
    setIsOpen(false);
    setContent("");
    reset();
  };

  const handleSubmit = () => {
    if (!content.trim() || isPending) return;
    mutate(content, {
      onSuccess: () => {
        setTimeout(handleClose, 1200);
      },
    });
  };

  return (
    <>
      <TriggerButton onClick={() => setIsOpen(true)}>
        의견 보내기
      </TriggerButton>
      {isOpen && (
        <Overlay onClick={handleClose}>
          <Container onClick={(e) => e.stopPropagation()}>
            <Title>의견 보내기</Title>
            <Textarea
              value={content}
              maxLength={FEEDBACK_CONTENT_MAX_LENGTH}
              placeholder="자유롭게 의견을 남겨주세요"
              onChange={(e) => setContent(e.target.value)}
              disabled={isPending || isSuccess}
              autoFocus
            />
            <CharCount>
              {content.length} / {FEEDBACK_CONTENT_MAX_LENGTH}
            </CharCount>
            {isError && (
              <ErrorMessage>
                전송에 실패했습니다. 잠시 후 다시 시도해주세요.
              </ErrorMessage>
            )}
            {isSuccess && (
              <SuccessMessage>
                감사합니다! 의견이 전달되었습니다.
              </SuccessMessage>
            )}
            <ButtonGroup>
              <Button onClick={handleClose}>닫기</Button>
              <Button
                $variant="primary"
                onClick={handleSubmit}
                disabled={!content.trim() || isPending || isSuccess}
              >
                {isPending ? "전송 중..." : "제출"}
              </Button>
            </ButtonGroup>
          </Container>
        </Overlay>
      )}
    </>
  );
};

export default FeedbackButton;
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd client && npx vitest run src/features/feedback/components/__tests__/feedbackButton.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add client/src/features/feedback/components
git commit -m "feat: FeedbackButton 컴포넌트 추가"
```

---

## Task 5: 헤더 / 모바일 드로어에 배선

**Files:**
- Modify: `client/src/layouts/header/header.tsx`
- Modify: `client/src/layouts/snb/mobileDrawer.tsx`
- Modify: `client/src/layouts/snb/mobileDrawer.styles.tsx`

**Interfaces:**
- Consumes: `FeedbackButton`(Task 4, `@/features/feedback/components/feedbackButton`)
- Produces: 없음(최종 배선 태스크)

이 두 레이아웃 파일에는 기존 테스트가 없다(레이아웃 컴포넌트 전반이 테스트 대상 밖). 새 테스트 스위트를 여기서 처음 만들지 않고, 기존 관례를 따라 브라우저 수동 확인으로 검증한다.

- [ ] **Step 1: 헤더(PC)에 배선**

`client/src/layouts/header/header.tsx`의 `UserInfo` 안, `LogoutButton` 앞에 추가:

```tsx
import FeedbackButton from "@/features/feedback/components/feedbackButton";
```

```tsx
      <UserInfo>
        <UserInfoText>{user?.displayName}</UserInfoText>
        <UserInfoImage src={user?.photoURL || ""} alt="user" />
        <FeedbackButton />
        <LogoutButton onClick={logout}>로그아웃</LogoutButton>
      </UserInfo>
```

- [ ] **Step 2: 모바일 드로어에 배선**

`client/src/layouts/snb/mobileDrawer.styles.tsx`의 `LogoutButton` 정의를 아래처럼 바꾼다 (margin-top을 래퍼로 옮김):

```tsx
export const UserActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 2px;
`;

export const LogoutButton = styled.button`
  font-size: 13px;
  background: none;
  border: none;
  color: #5f6368;
  cursor: pointer;
  padding: 0;

  &:hover {
    color: ${colors.brand.strong};
  }
`;
```

`client/src/layouts/snb/mobileDrawer.tsx` 수정:

```tsx
import FeedbackButton from "@/features/feedback/components/feedbackButton";
```

```tsx
import {
  Overlay,
  DrawerContainer,
  UserSection,
  UserImage,
  UserInfo,
  UserName,
  UserActions,
  LogoutButton,
  NavList,
  NavNavLink,
} from "./mobileDrawer.styles";
```

```tsx
        <UserSection>
          <UserImage src={user?.photoURL || ""} alt="user" />
          <UserInfo>
            <UserName>{user?.displayName}</UserName>
            <UserActions>
              <FeedbackButton />
              <LogoutButton onClick={logout}>로그아웃</LogoutButton>
            </UserActions>
          </UserInfo>
        </UserSection>
```

- [ ] **Step 3: 전체 유닛테스트 통과 확인**

Run: `cd client && npm test`
Expected: 기존 525개 + 이번에 추가한 12개(feedbackApi 4 + useSubmitFeedback 3 + feedbackButton 5) 전부 PASS.

- [ ] **Step 4: 브라우저에서 수동 확인**

`client && npm run dev`로 개발 서버를 띄우고 로그인한 상태에서:
1. PC 화면: 헤더의 "의견 보내기" 클릭 → 모달 열림 → 빈 상태에서 제출 버튼 비활성화 확인 → 텍스트 입력 후 제출 → 성공 메시지 확인 → 모달 자동 닫힘.
2. 모바일 폭(또는 반응형 드로어)에서도 동일하게 "의견 보내기"가 로그아웃 버튼 옆에 보이고 동일하게 동작하는지 확인.
3. Firebase 콘솔의 Firestore에서 `feedback` 컬렉션에 문서(`userId`, `email`, `content`, `createdAt`)가 실제로 생겼는지 확인.

- [ ] **Step 5: Commit**

```bash
git add client/src/layouts
git commit -m "feat: 헤더/모바일 드로어에 의견 보내기 버튼 배선"
```

---

## Self-Review 메모 (계획 작성자용, 실행 시 참고)

- 스펙의 모든 섹션(데이터 모델, 보안 규칙, 클라이언트 구조, 진입점, 에러 처리, 테스트)이 Task 1~5에 대응된다.
- `createdAt`은 스펙 초안의 `serverTimestamp()`에서 `new Date().toISOString()`으로 바뀌었다 — 코드베이스 기존 관례(`todoApi.createTodo`)와 일치시키기 위함. 스펙 문서 자체는 갱신하지 않았으니, 이 계획이 최신 소스다.
- `FEEDBACK_CONTENT_MAX_LENGTH`(클라이언트)와 `firestore.rules`의 `1000`(Task 1)이 같은 숫자인지 두 파일을 나란히 두고 확인할 것 — 어긋나면 클라이언트는 통과시키는데 규칙이 거부하는 상황이 생긴다.
