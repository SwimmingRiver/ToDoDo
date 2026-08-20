import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Firebase Auth 에뮬레이터(playwright.config.ts에서 기동)에 실제로
 * signInAnonymously를 호출해 인증된 세션을 만든다.
 *
 * 왜 storageState로 미리 저장해두지 않는가: Firebase Auth JS SDK는 세션을
 * IndexedDB에 저장하는데, Playwright의 context.storageState()는 cookie와
 * localStorage만 캡처하고 IndexedDB는 캡처하지 못한다. 그래서 매 테스트(=매
 * 브라우저 컨텍스트)마다 새로 로그인한다 — 부수 효과로 테스트마다 익명 사용자
 * uid가 달라져 Firestore 데이터가 테스트 간에 완전히 격리된다.
 */
export async function loginAsTestUser(page: Page): Promise<void> {
  // main.tsx가 dev 서버에서 항상 마운트하는 TanStack Query Devtools 토글
  // 버튼(prod 빌드에는 없음)이 화면 하단 요소들과 좌표가 겹쳐 클릭을 가로채는
  // 경우가 있어 숨긴다. page.goto()는 매번 실제 페이지 네비게이션이라
  // addStyleTag로는 다음 goto에서 스타일이 날아가므로, 모든 네비게이션에
  // 적용되는 addInitScript를 쓴다.
  await page.addInitScript(() => {
    const inject = () => {
      const style = document.createElement('style')
      style.textContent = '.tsqd-parent-container { display: none !important; }'
      document.head.appendChild(style)
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inject)
    } else {
      inject()
    }
  })

  // 앱(및 firebase.ts의 싱글턴 auth/db)이 부트스트랩되도록 아무 라우트나 먼저 연다.
  await page.goto('/login')

  await page.evaluate(async () => {
    // Vite dev 서버가 서빙하는 절대 경로를 브라우저 런타임에서 직접 동적
    // import한다. 정적 타입 해석 대상이 아니므로(e2e/는 tsconfig.app.json의
    // include에도 포함되지 않는다) 타입 에러를 억제한다.
    // @ts-expect-error 브라우저에서만 resolve되는 dev 서버 경로
    const mod = await import('/src/features/auth/testUtils/e2eAuth.ts')
    await mod.e2eSignIn()
  })

  // onAuthStateChanged가 비동기로 반영되므로, 보호된 라우트로 이동해 리다이렉트
  // 없이 들어가지는지로 로그인 완료를 확인한다.
  await page.goto('/today')
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 })
}
